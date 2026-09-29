// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HyperpadToken} from "./HyperpadToken.sol";

/// @title Hyperpad launchpad
/// @notice Launches coins that trade against ETH on a constant-product bonding curve with virtual
/// reserves. Every trade pays a 1% fee in ETH, split 30% to the coin's creator, 50% to the coin's
/// reel budget and 20% to the protocol. Fees accrue in this contract and are withdrawn by pull.
/// When a coin's curve supply sells out it graduates and curve trading stops.
contract HyperpadLaunchpad is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // 1B tokens, 18 decimals
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;   // sold on the curve
    uint256 public constant FEE_BPS = 100;                      // 1%
    uint256 public constant CREATOR_SHARE_BPS = 3_000;          // 30% of the fee
    uint256 public constant REEL_SHARE_BPS = 5_000;             // 50% of the fee
    uint256 private constant BPS = 10_000;

    uint256 public immutable initialVirtualEth;
    uint256 public immutable initialVirtualTokens;

    struct Coin {
        address creator;
        uint256 virtualEth;     // curve ETH reserve (virtual + real)
        uint256 virtualTokens;  // curve token reserve (virtual + real)
        uint256 realEth;        // ETH actually held for this coin's curve
        uint256 tokensSold;     // tokens sold on the curve so far
        bool graduated;
    }

    mapping(address => Coin) public coins;           // token => coin
    address[] public allCoins;
    mapping(address => uint256) public creatorFees;  // creator => claimable ETH
    mapping(address => uint256) public reelFees;     // token => ETH reserved for reels
    uint256 public protocolFees;
    uint256 public totalReserved;                    // sum of everything owed (curves + fees)
    address public reelOperator;                     // backend wallet that pays for video renders

    event CoinCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI);
    event Trade(
        address indexed token, address indexed trader, bool isBuy,
        uint256 ethAmount, uint256 tokenAmount, uint256 fee,
        uint256 virtualEth, uint256 virtualTokens, uint256 tokensSold
    );
    event Graduated(address indexed token, uint256 realEth);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event ReelFeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);
    event ReelOperatorSet(address indexed operator);

    error UnknownCoin();
    error CoinGraduated();
    error BadInput();
    error Slippage();
    error Expired();
    error NotReelOperator();
    error TransferFailed();

    constructor(address owner_, address reelOperator_, uint256 virtualEth_, uint256 virtualTokens_) Ownable(owner_) {
        if (virtualEth_ == 0 || virtualTokens_ <= CURVE_SUPPLY) revert BadInput();
        initialVirtualEth = virtualEth_;
        initialVirtualTokens = virtualTokens_;
        reelOperator = reelOperator_;
        emit ReelOperatorSet(reelOperator_);
    }

    // ---------------------------------------------------------------- launch

    /// @notice Create a coin. Any ETH sent is used as the creator's first buy.
    function createCoin(string calldata name, string calldata symbol, string calldata metadataURI, uint256 minTokensOut)
        external payable nonReentrant whenNotPaused returns (address token)
    {
        uint256 nl = bytes(name).length;
        uint256 sl = bytes(symbol).length;
        if (nl == 0 || nl > 32 || sl < 2 || sl > 8 || bytes(metadataURI).length > 256) revert BadInput();

        token = address(new HyperpadToken(name, symbol, metadataURI, TOTAL_SUPPLY));
        coins[token] = Coin({
            creator: msg.sender,
            virtualEth: initialVirtualEth,
            virtualTokens: initialVirtualTokens,
            realEth: 0,
            tokensSold: 0,
            graduated: false
        });
        allCoins.push(token);
        emit CoinCreated(token, msg.sender, name, symbol, metadataURI);

        if (msg.value > 0) _buy(token, msg.value, minTokensOut);
    }

    // ---------------------------------------------------------------- trading

    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external payable nonReentrant whenNotPaused returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        return _buy(token, msg.value, minTokensOut);
    }

    function sell(address token, uint256 tokenAmount, uint256 minEthOut, uint256 deadline)
        external nonReentrant whenNotPaused returns (uint256 ethOut)
    {
        if (block.timestamp > deadline) revert Expired();
        Coin storage c = _live(token);
        if (tokenAmount == 0 || tokenAmount > c.tokensSold) revert BadInput();

        uint256 gross = _ethOutForTokens(c, tokenAmount);
        uint256 fee = gross * FEE_BPS / BPS;
        ethOut = gross - fee;
        if (ethOut < minEthOut) revert Slippage();

        c.virtualEth -= gross;
        c.virtualTokens += tokenAmount;
        c.realEth -= gross;
        c.tokensSold -= tokenAmount;
        totalReserved -= gross;
        _takeFee(token, c.creator, fee);

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        emit Trade(token, msg.sender, false, gross, tokenAmount, fee, c.virtualEth, c.virtualTokens, c.tokensSold);
        _send(msg.sender, ethOut);
    }

    function _buy(address token, uint256 value, uint256 minTokensOut) internal returns (uint256 tokensOut) {
        Coin storage c = _live(token);
        if (value == 0) revert BadInput();

        uint256 fee = value * FEE_BPS / BPS;
        uint256 ethIn = value - fee;
        tokensOut = _tokensOutForEth(c, ethIn);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        uint256 refund;
        if (tokensOut >= remaining) {
            // Last buy: sell exactly what is left and refund the unused ETH, fee included.
            tokensOut = remaining;
            uint256 needed = _ethInForTokens(c, remaining);
            uint256 neededFee = needed * FEE_BPS / (BPS - FEE_BPS);
            if (needed + neededFee > value) neededFee = value - needed; // rounding guard
            refund = value - needed - neededFee;
            ethIn = needed;
            fee = neededFee;
        }
        if (tokensOut == 0 || tokensOut < minTokensOut) revert Slippage();

        c.virtualEth += ethIn;
        c.virtualTokens -= tokensOut;
        c.realEth += ethIn;
        c.tokensSold += tokensOut;
        totalReserved += ethIn;
        _takeFee(token, c.creator, fee);

        IERC20(token).safeTransfer(msg.sender, tokensOut);
        emit Trade(token, msg.sender, true, ethIn, tokensOut, fee, c.virtualEth, c.virtualTokens, c.tokensSold);

        if (c.tokensSold == CURVE_SUPPLY) {
            c.graduated = true;
            emit Graduated(token, c.realEth);
        }
        if (refund > 0) _send(msg.sender, refund);
    }

    function _takeFee(address token, address creator, uint256 fee) internal {
        uint256 toCreator = fee * CREATOR_SHARE_BPS / BPS;
        uint256 toReels = fee * REEL_SHARE_BPS / BPS;
        uint256 toProtocol = fee - toCreator - toReels;
        creatorFees[creator] += toCreator;
        reelFees[token] += toReels;
        protocolFees += toProtocol;
        totalReserved += fee;
    }

    // ---------------------------------------------------------------- quotes

    function quoteBuy(address token, uint256 value) external view returns (uint256 tokensOut, uint256 fee) {
        Coin storage c = _live(token);
        fee = value * FEE_BPS / BPS;
        tokensOut = _tokensOutForEth(c, value - fee);
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        if (tokensOut > remaining) tokensOut = remaining;
    }

    function quoteSell(address token, uint256 tokenAmount) external view returns (uint256 ethOut, uint256 fee) {
        Coin storage c = _live(token);
        if (tokenAmount > c.tokensSold) revert BadInput();
        uint256 gross = _ethOutForTokens(c, tokenAmount);
        fee = gross * FEE_BPS / BPS;
        ethOut = gross - fee;
    }

    /// @notice Spot price in wei per whole token (1e18 units).
    function priceWei(address token) external view returns (uint256) {
        Coin storage c = coins[token];
        if (c.creator == address(0)) revert UnknownCoin();
        return c.virtualEth * 1 ether / c.virtualTokens;
    }

    function coinCount() external view returns (uint256) { return allCoins.length; }

    function _tokensOutForEth(Coin storage c, uint256 ethIn) internal view returns (uint256) {
        uint256 k = c.virtualEth * c.virtualTokens;
        return c.virtualTokens - _divUp(k, c.virtualEth + ethIn);
    }

    function _ethOutForTokens(Coin storage c, uint256 tokenAmount) internal view returns (uint256) {
        uint256 k = c.virtualEth * c.virtualTokens;
        return c.virtualEth - _divUp(k, c.virtualTokens + tokenAmount);
    }

    function _ethInForTokens(Coin storage c, uint256 tokenAmount) internal view returns (uint256) {
        uint256 k = c.virtualEth * c.virtualTokens;
        return _divUp(k, c.virtualTokens - tokenAmount) - c.virtualEth;
    }

    // Rounding up the new reserve always rounds the trader's side down, so the curve never pays out more than k allows.
    function _divUp(uint256 a, uint256 b) private pure returns (uint256) { return (a + b - 1) / b; }

    function _live(address token) internal view returns (Coin storage c) {
        c = coins[token];
        if (c.creator == address(0)) revert UnknownCoin();
        if (c.graduated) revert CoinGraduated();
    }

    // ---------------------------------------------------------------- withdrawals

    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        amount = creatorFees[msg.sender];
        if (amount == 0) revert BadInput();
        creatorFees[msg.sender] = 0;
        totalReserved -= amount;
        emit CreatorFeesClaimed(msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice The reel operator withdraws a coin's reel budget to pay for its video renders.
    function withdrawReelFees(address token, address to, uint256 amount) external nonReentrant {
        if (msg.sender != reelOperator) revert NotReelOperator();
        if (amount == 0 || amount > reelFees[token] || to == address(0)) revert BadInput();
        reelFees[token] -= amount;
        totalReserved -= amount;
        emit ReelFeesWithdrawn(token, to, amount);
        _send(to, amount);
    }

    function withdrawProtocolFees(address to) external onlyOwner nonReentrant {
        uint256 amount = protocolFees;
        if (amount == 0 || to == address(0)) revert BadInput();
        protocolFees = 0;
        totalReserved -= amount;
        emit ProtocolFeesWithdrawn(to, amount);
        _send(to, amount);
    }

    /// @notice After graduation the curve's ETH and the unsold 20% of supply are released to the
    /// owner to seed a DEX pool. Only callable for graduated coins.
    function releaseGraduated(address token, address to) external onlyOwner nonReentrant {
        Coin storage c = coins[token];
        if (!c.graduated || to == address(0)) revert BadInput();
        uint256 eth = c.realEth;
        c.realEth = 0;
        totalReserved -= eth;
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
        _send(to, eth);
    }

    // ---------------------------------------------------------------- admin

    function setReelOperator(address op) external onlyOwner {
        reelOperator = op;
        emit ReelOperatorSet(op);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Plain ETH transfers are rejected so nothing gets stuck outside the accounting.
    receive() external payable { revert BadInput(); }
}
