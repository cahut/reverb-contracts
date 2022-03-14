const { ethers } = require("hardhat");
const { expect } = require("chai");
const chai = require('chai');
const chaiAlmost = require('chai-almost');

chai.use(chaiAlmost(100));

const cryptocom = '0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3';
const usdc_address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ausdc_address = '0xBcca60bB61934080951369a648Fb03DF4F96263C';
const ilendingpool_addressesprovider = '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5';
const token_abi = ['function transfer(address,uint256) external',
  'function balanceOf(address) external view returns(uint256)',
  'function approve(address,uint256) external'];

async function getUSD(from, to, amount) {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [from],
  });

  const signer = await ethers.getSigner(from);
  const usdc = new ethers.Contract(usdc_address, token_abi, signer);

  let tx;
  for (let i = 0; i < to.length; i++) {
    tx = await usdc.transfer(to[i], amount);
    await tx.wait();
  }

  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [from],
  });

  // console.log('Successfully sent ', amount / 1000000, ' USDC to ', to);
}

describe("Token", async function () {
  let deployer, addr1, addr2;
  let token;
  let tx;

  before(async function () {
    [deployer, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("LPToken");
    token = await Token.deploy();
    await token.deployed();
  });

  it("Should start with 0 total supply", async function () {
    expect(await token.totalSupply()).to.equal(0);
  });

  it("Should only let the owner mint tokens", async function () {
    expect(await token.owner()).to.equal(deployer.address);
    const amount = 500;
    await token.mint(deployer.address, amount);
    expect(token.connect(addr1).mint(addr1.address, amount)).to.be.reverted;
    expect(await token.totalSupply()).to.equal(amount);
  });

  it("Should correctly execute transfers", async function () {
    const balanceBefore = await token.balanceOf(deployer.address);
    const amountToSend = 200;

    tx = await token.transfer(addr1.address, amountToSend);
    await tx.wait();

    expect(await token.balanceOf(addr1.address)).to.equal(amountToSend);
    expect(await token.balanceOf(deployer.address)).to.equal(balanceBefore - amountToSend);
  });

  it("Should correctly execute transferFrom", async function () {
    const balanceBefore = await token.balanceOf(deployer.address);
    const amountToSend = 200;

    tx = await token.approve(addr2.address, amountToSend);
    await tx.wait();
    expect(await token.allowance(deployer.address, addr2.address)).to.equal(amountToSend);

    tx = await token.connect(addr2).transferFrom(deployer.address, addr2.address, amountToSend);
    await tx.wait();
    expect(await token.allowance(deployer.address, addr2.address)).to.equal(0);

    expect(await token.balanceOf(addr2.address)).to.equal(amountToSend);
  });
});

describe("Custodian single LP", async function () {
  let deployer, alice, addr2, addr3, profits;
  let token, custodian, usdc;
  let tx;

  before(async function () {
    [deployer, alice, addr2, addr3, profits] = await ethers.getSigners();
    await getUSD(cryptocom, [deployer.address, alice.address, addr2.address, addr3.address, profits.address], 10000000000);

    const Token = await ethers.getContractFactory("LPToken");
    token = await Token.deploy();
    await token.deployed();

    const Custodian = await ethers.getContractFactory("Custodian");
    custodian = await Custodian.deploy(token.address, usdc_address, ausdc_address, ilendingpool_addressesprovider);
    await custodian.deployed();

    tx = await token.transferOwnership(custodian.address);
    await tx.wait();

    usdc = new ethers.Contract(usdc_address, token_abi, deployer);

  });

  it("Should allow deposits and correctly account for LP", async function () {
    expect(await token.totalSupply()).to.equal(0);
    tx = await usdc.connect(alice).approve(custodian.address, 1000000000);
    await tx.wait();

    tx = await custodian.connect(alice).deposit(1000000000, alice.address);
    await tx.wait();

    const lpBalance = await token.balanceOf(alice.address);
    expect(lpBalance).to.equal(1000000000);
    expect(await custodian.convertLpToUsdc(lpBalance)).to.equal(1000000000);

  });

  it("Should correctly account for LP shares", async function () {
    const lpBalance = await token.balanceOf(alice.address);
    const usdcBalance = await custodian.convertLpToUsdc(lpBalance);

    const totalLpSupply = await token.totalSupply();
    expect(totalLpSupply).to.equal(await token.balanceOf(alice.address));

    const profitAmount = 1000000000;
    tx = await usdc.connect(profits).transfer(custodian.address, profitAmount);
    await tx.wait();

    expect(await custodian.getTotalBalance()).to.equal(await custodian.convertLpToUsdc(lpBalance));
  });
});

describe("Custodian multiple LP", async function () {
  let deployer, alice, bob, cathy, profits;
  let token, custodian, usdc;
  let tx;

  beforeEach(async function () {
    [deployer, alice, bob, cathy, profits] = await ethers.getSigners();
    await getUSD(cryptocom, [deployer.address, alice.address, bob.address, cathy.address, profits.address], 10000000000);

    const Token = await ethers.getContractFactory("LPToken");
    token = await Token.deploy();
    await token.deployed();

    const Custodian = await ethers.getContractFactory("Custodian");
    custodian = await Custodian.deploy(token.address, usdc_address, ausdc_address, ilendingpool_addressesprovider);
    await custodian.deployed();

    tx = await token.transferOwnership(custodian.address);
    await tx.wait();

    usdc = new ethers.Contract(usdc_address, token_abi, deployer);
  });

  it("3 deposits, 1 withdrawal", async function () {
    // Alice deposits 1000, then pool accrues 1000 in profits
    // Bob deposits 2000, then pool accrues 4000 in profits
    // Cathy deposits 2000, then pool accrues 5000 in profits
    // Alice is owed 6000, Bob is owed 6000, and Cathy is owed 3000

    expect(await token.totalSupply()).to.equal(0);

    await usdc.connect(alice).approve(custodian.address, 1000000000);
    tx = await custodian.connect(alice).deposit(1000000000, alice.address);
    await tx.wait();

    expect(await token.totalSupply()).to.equal(1000000000);

    await usdc.connect(profits).transfer(custodian.address, 1000000000);

    expect(await token.totalSupply()).to.equal(1000000000);

    await usdc.connect(bob).approve(custodian.address, 2000000000);
    tx = await custodian.connect(bob).deposit(2000000000, bob.address);
    await tx.wait();

    expect(await token.totalSupply()).to.almost.equal(2000000000);

    await usdc.connect(profits).transfer(custodian.address, 4000000000);

    //expect(await token.totalSupply()).to.equal(2000000000);

    await usdc.connect(cathy).approve(custodian.address, 2000000000);
    tx = await custodian.connect(cathy).deposit(2000000000, cathy.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 5000000000);

    const aliceLp = await token.balanceOf(alice.address);
    const bobLp = await token.balanceOf(bob.address);
    const cathyLp = await token.balanceOf(cathy.address);

    expect(await custodian.getTotalBalance()).to.equal(15000000000);

    expect(await token.totalSupply()).to.equal(2500000000);
    expect(await custodian.convertLpToUsdc(aliceLp)).to.equal(6000000000);
    expect(await custodian.convertLpToUsdc(bobLp)).to.equal(6000000000);
    expect(await custodian.convertLpToUsdc(cathyLp)).to.equal(3000000000);
  });

  it("3 deposits, 3 withdrawals", async function () {
    // Alice deposits 1000, then pool accrues 1000 in profits
    // Bob deposits 2000, then pool accrues 4000 in profits
    // Cathy deposits 2000, then pool accrues 5000 in profits

    expect(await token.totalSupply()).to.equal(0);

    await usdc.connect(alice).approve(custodian.address, 1000000000);
    tx = await custodian.connect(alice).deposit(1000000000, alice.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 1000000000);

    await usdc.connect(bob).approve(custodian.address, 2000000000);
    tx = await custodian.connect(bob).deposit(2000000000, bob.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 4000000000);

    await usdc.connect(cathy).approve(custodian.address, 2000000000);
    tx = await custodian.connect(cathy).deposit(2000000000, cathy.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 5000000000);

    const aliceLp = await token.balanceOf(alice.address);
    const bobLp = await token.balanceOf(bob.address);
    const cathyLp = await token.balanceOf(cathy.address);

    const aliceUsdc = await usdc.balanceOf(alice.address);
    const bobUsdc = await usdc.balanceOf(bob.address);
    const cathyUsdc = await usdc.balanceOf(cathy.address);

    // check total balance
    expect(await custodian.getTotalBalance()).to.almost.equal(15000000000);

    // approve LP token to custodian to redeem USDC
    await token.connect(alice).approve(custodian.address, ethers.constants.MaxUint256);
    await token.connect(bob).approve(custodian.address, ethers.constants.MaxUint256);
    await token.connect(cathy).approve(custodian.address, ethers.constants.MaxUint256);

    // start redeeming USDC and check that amounts match 
    await custodian.connect(alice).redeem(aliceLp);
    expect((await usdc.balanceOf(alice.address) - aliceUsdc)).to.almost.equal(6000000000);

    await custodian.connect(bob).redeem(bobLp);
    expect((await usdc.balanceOf(bob.address) - bobUsdc)).to.almost.equal(6000000000);

    await custodian.connect(cathy).redeem(cathyLp);
    expect((await usdc.balanceOf(cathy.address) - cathyUsdc)).to.almost.equal(3000000000);
  });

  it("3 deposits, 6 piecewise withdrawals", async function () {
    // Alice deposits 1000, then pool accrues 1000 in profits
    // Bob deposits 2000, then pool accrues 4000 in profits
    // Cathy deposits 2000, then pool accrues 5000 in profits

    expect(await token.totalSupply()).to.equal(0);

    await usdc.connect(alice).approve(custodian.address, 1000000000);
    tx = await custodian.connect(alice).deposit(1000000000, alice.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 1000000000);

    await usdc.connect(bob).approve(custodian.address, 2000000000);
    tx = await custodian.connect(bob).deposit(2000000000, bob.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 4000000000);

    await usdc.connect(cathy).approve(custodian.address, 2000000000);
    tx = await custodian.connect(cathy).deposit(2000000000, cathy.address);
    await tx.wait();

    await usdc.connect(profits).transfer(custodian.address, 5000000000);

    const aliceLp = await token.balanceOf(alice.address);
    const bobLp = await token.balanceOf(bob.address);
    const cathyLp = await token.balanceOf(cathy.address);

    const aliceUsdc = await usdc.balanceOf(alice.address);
    const bobUsdc = await usdc.balanceOf(bob.address);
    const cathyUsdc = await usdc.balanceOf(cathy.address);

    // check total balance
    expect(await custodian.getTotalBalance()).to.almost.equal(15000000000);

    // approve LP token to custodian to redeem USDC
    await token.connect(alice).approve(custodian.address, ethers.constants.MaxUint256);
    await token.connect(bob).approve(custodian.address, ethers.constants.MaxUint256);
    await token.connect(cathy).approve(custodian.address, ethers.constants.MaxUint256);

    // start redeeming USDC and check that amounts match 
    await custodian.connect(alice).redeem(aliceLp / 2);
    await custodian.connect(cathy).redeem(cathyLp / 2);
    await custodian.connect(bob).redeem(bobLp / 2);
    await custodian.connect(cathy).redeem(cathyLp / 2);
    await custodian.connect(bob).redeem(bobLp / 2);
    await custodian.connect(alice).redeem(aliceLp / 2);

    expect((await usdc.balanceOf(alice.address) - aliceUsdc)).to.almost.equal(6000000000);
    expect((await usdc.balanceOf(bob.address) - bobUsdc)).to.almost.equal(6000000000);
    expect((await usdc.balanceOf(cathy.address) - cathyUsdc)).to.almost.equal(3000000000);
  });
});

describe("Withdrawing as owner", async function () {
  let deployer, alice, addr2, addr3, profits;
  let token, custodian, usdc;
  let tx;

  before(async function () {
    [deployer, alice, addr2, addr3, profits] = await ethers.getSigners();
    await getUSD(cryptocom, [deployer.address, alice.address, addr2.address, addr3.address, profits.address], 10000000000);

    const Token = await ethers.getContractFactory("LPToken");
    token = await Token.deploy();
    await token.deployed();

    const Custodian = await ethers.getContractFactory("Custodian");
    custodian = await Custodian.deploy(token.address, usdc_address, ausdc_address, ilendingpool_addressesprovider);
    await custodian.deployed();

    tx = await token.transferOwnership(custodian.address);
    await tx.wait();

    usdc = new ethers.Contract(usdc_address, token_abi, deployer);

    await usdc.connect(alice).approve(custodian.address, 1000000000);
    tx = await custodian.connect(alice).deposit(1000000000, alice.address);
    await tx.wait();
  });

  it("Should allow you to withdraw as owner", async function () {
    expect(await custodian.getTotalBalance()).to.be.gte(1000000000);

    tx = await custodian.withdrawToSafe(800000000)
    await tx.wait()
  });
});


describe("Repayment pool ", async function () {
  let deployer, alice, bob, cathy, profits;
  let token, custodian, usdc;
  let tx;

  beforeEach(async function () {
    [deployer, alice, bob, cathy, profits] = await ethers.getSigners();
    await getUSD(cryptocom, [deployer.address, alice.address, bob.address, cathy.address, profits.address], 10000000000);

    const Token = await ethers.getContractFactory("LPToken");
    token = await Token.deploy();
    await token.deployed();

    const Custodian = await ethers.getContractFactory("Custodian");
    custodian = await Custodian.deploy(token.address);
    await custodian.deployed();

    tx = await token.transferOwnership(custodian.address);
    await tx.wait();

    usdc = new ethers.Contract(usdc_address, token_abi, deployer);

  });
});