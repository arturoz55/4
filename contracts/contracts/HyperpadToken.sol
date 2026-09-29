// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply ERC-20 created by the Hyperpad launchpad. The whole supply is minted
/// to the launchpad at creation; there is no owner and no further minting.
contract HyperpadToken is ERC20 {
    address public immutable launchpad;
    string public metadataURI;

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, uint256 supply)
        ERC20(name_, symbol_)
    {
        launchpad = msg.sender;
        metadataURI = metadataURI_;
        _mint(msg.sender, supply);
    }
}
