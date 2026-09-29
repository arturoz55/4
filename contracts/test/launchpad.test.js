const { expect } = require('chai');
const { ethers } = require('hardhat');

const E = ethers.parseEther;
const VIRTUAL_ETH = E('1.5');
const VIRTUAL_TOKENS = E('1073000000');
const CURVE = E('800000000');
const far = () => Math.floor(Date.now() / 1000) + 3600 * 24 * 365;

async function setup() {
  const [owner, operator, creator, alice, bob] = await ethers.getSigners();
  const Launchpad = await ethers.getContractFactory('HyperpadLaunchpad');
  const lp = await Launchpad.deploy(owner.address, operator.address, VIRTUAL_ETH, VIRTUAL_TOKENS);
  const tx = await lp.connect(creator).createCoin('Mossy', 'MOSSY', 'https://hyperpad.example/api/meta/1', 0);
  const rc = await tx.wait();
  const ev = rc.logs.map(l => { try { return lp.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === 'CoinCreated');
  const token = await ethers.getContractAt('HyperpadToken', ev.args.token);
  return { lp, token, owner, operator, creator, alice, bob };
}
async function solvent(lp) {
  const bal = await ethers.provider.getBalance(await lp.getAddress());
  expect(bal).to.be.gte(await lp.totalReserved());
}

describe('HyperpadLaunchpad', () => {
  it('creates a coin with the full supply held by the launchpad', async () => {
    const { lp, token, creator } = await setup();
    expect(await token.name()).to.equal('Mossy');
    expect(await token.symbol()).to.equal('MOSSY');
    expect(await token.totalSupply()).to.equal(E('1000000000'));
    expect(await token.balanceOf(await lp.getAddress())).to.equal(E('1000000000'));
    expect(await token.metadataURI()).to.equal('https://hyperpad.example/api/meta/1');
    const c = await lp.coins(await token.getAddress());
    expect(c.creator).to.equal(creator.address);
    expect(await lp.coinCount()).to.equal(1n);
  });

  it('rejects bad names and symbols', async () => {
    const { lp } = await setup();
    await expect(lp.createCoin('', 'AB', '', 0)).to.be.revertedWithCustomError(lp, 'BadInput');
    await expect(lp.createCoin('X', 'A', '', 0)).to.be.revertedWithCustomError(lp, 'BadInput');
    await expect(lp.createCoin('X', 'TOOLONGSYM', '', 0)).to.be.revertedWithCustomError(lp, 'BadInput');
  });

  it('buys at the quoted amount and splits the 1% fee 30/50/20', async () => {
    const { lp, token, creator, alice } = await setup();
    const addr = await token.getAddress();
    const [quote, qfee] = await lp.quoteBuy(addr, E('1'));
    await expect(lp.connect(alice).buy(addr, quote, far(), { value: E('1') })).to.emit(lp, 'Trade');
    expect(await token.balanceOf(alice.address)).to.equal(quote);
    expect(qfee).to.equal(E('0.01'));
    expect(await lp.creatorFees(creator.address)).to.equal(E('0.003'));
    expect(await lp.reelFees(addr)).to.equal(E('0.005'));
    expect(await lp.protocolFees()).to.equal(E('0.002'));
    await solvent(lp);
  });

  it('enforces slippage and deadlines', async () => {
    const { lp, token, alice } = await setup();
    const addr = await token.getAddress();
    const [quote] = await lp.quoteBuy(addr, E('1'));
    await expect(lp.connect(alice).buy(addr, quote + 1n, far(), { value: E('1') })).to.be.revertedWithCustomError(lp, 'Slippage');
    await expect(lp.connect(alice).buy(addr, 0, 1, { value: E('1') })).to.be.revertedWithCustomError(lp, 'Expired');
  });

  it('sells back to the curve and pays the fee on the ETH side', async () => {
    const { lp, token, alice } = await setup();
    const addr = await token.getAddress();
    await lp.connect(alice).buy(addr, 0, far(), { value: E('2') });
    const bal = await token.balanceOf(alice.address);
    const half = bal / 2n;
    const [ethOut, fee] = await lp.quoteSell(addr, half);
    await token.connect(alice).approve(await lp.getAddress(), half);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await lp.connect(alice).sell(addr, half, ethOut, far());
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect(await ethers.provider.getBalance(alice.address)).to.equal(before + ethOut - gas);
    expect(fee).to.be.gt(0n);
    await solvent(lp);
  });

  it('never pays out more than was put in (round trip loses only fees)', async () => {
    const { lp, token, alice } = await setup();
    const addr = await token.getAddress();
    await lp.connect(alice).buy(addr, 0, far(), { value: E('3') });
    const bal = await token.balanceOf(alice.address);
    await token.connect(alice).approve(await lp.getAddress(), bal);
    const [ethOut] = await lp.quoteSell(addr, bal);
    expect(ethOut).to.be.lt(E('3'));
    await lp.connect(alice).sell(addr, bal, 0, far());
    const c = await lp.coins(addr);
    expect(c.tokensSold).to.equal(0n);
    await solvent(lp);
  });

  it('sells out the curve, refunds the excess and graduates', async () => {
    const { lp, token, alice } = await setup();
    const addr = await token.getAddress();
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await lp.connect(alice).buy(addr, 0, far(), { value: E('100') });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect(await token.balanceOf(alice.address)).to.equal(CURVE);
    const spent = before - (await ethers.provider.getBalance(alice.address)) - gas;
    expect(spent).to.be.lt(E('100'));
    await expect(tx).to.emit(lp, 'Graduated');
    expect((await lp.coins(addr)).graduated).to.equal(true);
    await expect(lp.connect(alice).buy(addr, 0, far(), { value: E('1') })).to.be.revertedWithCustomError(lp, 'CoinGraduated');
    await solvent(lp);
  });

  it('lets only the right people withdraw', async () => {
    const { lp, token, owner, operator, creator, alice, bob } = await setup();
    const addr = await token.getAddress();
    await lp.connect(alice).buy(addr, 0, far(), { value: E('2') });
    await expect(lp.connect(alice).claimCreatorFees()).to.be.revertedWithCustomError(lp, 'BadInput');
    await expect(lp.connect(creator).claimCreatorFees()).to.changeEtherBalance(creator, E('0.006'));
    await expect(lp.connect(alice).withdrawReelFees(addr, alice.address, 1)).to.be.revertedWithCustomError(lp, 'NotReelOperator');
    await expect(lp.connect(operator).withdrawReelFees(addr, bob.address, E('0.01'))).to.changeEtherBalance(bob, E('0.01'));
    await expect(lp.connect(operator).withdrawReelFees(addr, bob.address, 1)).to.be.revertedWithCustomError(lp, 'BadInput');
    await expect(lp.connect(alice).withdrawProtocolFees(alice.address)).to.be.revertedWithCustomError(lp, 'OwnableUnauthorizedAccount');
    await expect(lp.connect(owner).withdrawProtocolFees(owner.address)).to.changeEtherBalance(owner, E('0.004'));
    await solvent(lp);
  });

  it('releases a graduated coin to the owner for a DEX pool', async () => {
    const { lp, token, owner, alice, bob } = await setup();
    const addr = await token.getAddress();
    await expect(lp.connect(owner).releaseGraduated(addr, bob.address)).to.be.revertedWithCustomError(lp, 'BadInput');
    await lp.connect(alice).buy(addr, 0, far(), { value: E('10') });
    const realEth = (await lp.coins(addr)).realEth;
    await expect(lp.connect(owner).releaseGraduated(addr, bob.address)).to.changeEtherBalance(bob, realEth);
    expect(await token.balanceOf(bob.address)).to.equal(E('200000000'));
    await solvent(lp);
  });

  it('can be paused by the owner', async () => {
    const { lp, token, owner, alice } = await setup();
    await lp.connect(owner).pause();
    await expect(lp.connect(alice).buy(await token.getAddress(), 0, far(), { value: E('1') })).to.be.revertedWithCustomError(lp, 'EnforcedPause');
    await lp.connect(owner).unpause();
    await lp.connect(alice).buy(await token.getAddress(), 0, far(), { value: E('1') });
  });

  it('accepts a first buy inside createCoin', async () => {
    const { lp, creator } = await setup();
    const tx = await lp.connect(creator).createCoin('Night Shift', 'NITE', '', 0, { value: E('0.5') });
    const rc = await tx.wait();
    const trade = rc.logs.map(l => { try { return lp.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === 'Trade');
    expect(trade.args.isBuy).to.equal(true);
    expect(trade.args.trader).to.equal(creator.address);
  });

  it('rejects plain ETH transfers', async () => {
    const { lp, alice } = await setup();
    await expect(alice.sendTransaction({ to: await lp.getAddress(), value: 1 })).to.be.reverted;
  });

  it('stays solvent through random buys and sells', async () => {
    const { lp, token, alice, bob } = await setup();
    const addr = await token.getAddress();
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 60; i++) {
      const who = rnd() < .5 ? alice : bob;
      const bal = await token.balanceOf(who.address);
      if (rnd() < .6 || bal === 0n) {
        const v = E((0.01 + rnd() * 2).toFixed(6));
        const c = await lp.coins(addr);
        if (c.graduated) break;
        await lp.connect(who).buy(addr, 0, far(), { value: v });
      } else {
        const amt = bal * BigInt(1 + Math.floor(rnd() * 99)) / 100n;
        if (amt === 0n) continue;
        await token.connect(who).approve(await lp.getAddress(), amt);
        await lp.connect(who).sell(addr, amt, 0, far());
      }
      await solvent(lp);
    }
    // everyone sells everything: the curve must still cover it
    for (const who of [alice, bob]) {
      const bal = await token.balanceOf(who.address);
      if (bal > 0n && !(await lp.coins(addr)).graduated) {
        await token.connect(who).approve(await lp.getAddress(), bal);
        await lp.connect(who).sell(addr, bal, 0, far());
      }
    }
    await solvent(lp);
  });
});
