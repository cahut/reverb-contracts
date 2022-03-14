const hre = require("hardhat");
const { ethers } = require("hardhat");

const usdc_address = '0x2058a9d7613eee744279e3856ef0eada5fcbaa7e';

const token_abi = ['function transfer(address,uint256) external',
    'function balanceOf(address) external view returns(uint256)',
    'function approve(address,uint256) external'];

const repayment_abi = ['function dealList(uint256) external view returns(uint256,uint256,uint256,uint256,uint256,uint16,uint16,string)',
    'function getLastDealId() external view returns(uint256)',
    'function createDeal(uint256,uint256,uint256,uint16,uint16,string memory) external',
    'function repay(uint256 dealId,uint256 amount,uint256 interest) external']

const faucet_abi = ['function pullTo(address dest, uint amt) external']

const owner_abi = ['function transferOwnership(address) external']

let custodianAbi = ['function deposit(uint256 amount, address onBehalfOf) external',
    'function redeem(uint256 lpAmount) external',
    'function withdrawToSafe(uint256 amount) external',
    'function getPoolData(address user) external view returns (address, uint256, uint256, uint256, uint256, uint256)',
    'function calculateUsdcToLp(uint256 usdcAmount) external view returns (uint256)',
    'function aavePool() external view returns(address)',
    'function repaymentPool() external view returns(address)',
    'function getTotalBalance() external view returns(uint)',
    'function getAvailableBalance() external view returns(uint)',
    'function reserveBalance() external view returns(uint)',
    'function owner() external view returns(address)'];

let poolAddress = '0x60f75AD77C72299D4C65F9941F3D7AaD5B786eDA'

const aUsdc_address = '0x2271e3Fef9e15046d09E1d78a8FF038c691E9Cf9';
const ILendingPoolAddressesProvider = '0x178113104fEcbcD7fF8669a0150721e231F0FD4B';

async function main() {
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0xd5817d8eF578399fC9d6C013D63A81f0887F61CE"],
    });

    const signer = await ethers.getSigner("0xd5817d8eF578399fC9d6C013D63A81f0887F61CE")
    console.log("Current account:", signer.address);

    const pool = new ethers.Contract(poolAddress, custodianAbi, signer)

    const reserveBalance = await pool.reserveBalance()

    console.log(await pool.withdrawToSafe(reserveBalance.div(5)))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
