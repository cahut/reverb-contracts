const { deployProxyImpl } = require("@openzeppelin/hardhat-upgrades/dist/utils");
const hre = require("hardhat");
const { ethers } = require("hardhat");

const usdc_address = '0x2058a9d7613eee744279e3856ef0eada5fcbaa7e';
const usdc_faucet = '0x1480376aB166Eb712CF944592d215ECe0D47f268';

const token_abi = ['function transfer(address,uint256) external',
  'function balanceOf(address) external view returns(uint256)',
  'function approve(address,uint256) external'];

const custodian_abi = ['function deposit(uint256 amount, address onBehalfOf) external',
  'function redeem(uint256 lpAmount) external',
  'function getPoolData(address user) external view returns (address, uint256, uint256, uint256, uint256, uint256)',
  'function calculateUsdcToLp(uint256 usdcAmount) external view returns (uint256)',
  'function aavePool() external view returns(address)',
  'function repaymentPool() external view returns(address)',
  'function withdrawToSafe(uint256 amount) external',
  'function owner() external returns(address)'];

const repayment_abi = ['function dealList(uint256) external view returns(uint256,uint256,uint256,uint256,uint256,uint16,uint16,string)',
  'function getLastDealId() external view returns(uint256)',
  'function createDeal(uint256,uint256,uint256,uint16,uint16,string memory) external',
  'function repay(uint256 dealId,uint256 amount,uint256 interest) external']

const faucet_abi = ['function pullTo(address dest, uint amt) external']

const owner_abi = ['function transferOwnership(address) external']


async function deploy() {
  const signer = await hre.ethers.getSigner();
  console.log("Deployer account:", signer.address);

  const Token = await hre.ethers.getContractFactory("LPToken");
  const token = await Token.deploy();
  await token.deployed();

  console.log('Token deployed successfully at:', token.address)

  const Custodian = await hre.ethers.getContractFactory("Custodian");
  const custodian = await Custodian.deploy(token.address, { gasLimit: 10000000 });
  await custodian.deployed()

  console.log('Custodian deployed successfully at:', custodian.address)

  const Repayment = await hre.ethers.getContractFactory("RepaymentPool");
  const repayment = await Repayment.deploy(custodian.address, { gasLimit: 10000000 });
  await repayment.deployed()

  console.log('Repayment pool deployed successfully at:', repayment.address)

  await token.transferOwnership(custodian.address);
  console.log('Ownership of LP transferred to custodian');

  return { token: token.address, custodian: custodian.address, repayment: repayment.address };
}

async function mintUSDC(address, amount, signer) {
  const usdcFaucet = new ethers.Contract(usdc_faucet, faucet_abi, signer);
  let tx = await usdcFaucet.pullTo(address, amount);
  await tx.wait();
}


async function main() {
  const signer = await hre.ethers.getSigner();
  console.log(signer.address)

  let tx;
  const addresses = {
    token: '0xD5Cc83402802577352E7D2aA0eaDE9925f221cE6',
    custodian: '0x60f75AD77C72299D4C65F9941F3D7AaD5B786eDA',
    repayment: '0x2c607cF62a1482550311F03Dc3C13631AFEF10e2'
  };

  const token = new ethers.Contract(addresses.token, token_abi, signer);
  const custodian = new ethers.Contract(addresses.custodian, custodian_abi, signer);
  const repayment = new ethers.Contract(addresses.repayment, repayment_abi, signer);
  const usdc = new ethers.Contract(usdc_address, token_abi, signer);

  tx = await custodian.withdrawToSafe(100043514651, { gasLimit: 1000000 })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });