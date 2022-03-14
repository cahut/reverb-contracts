const hre = require("hardhat");
const { ethers } = require("hardhat");

const usdc_address = '0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e';
const aUsdc_address = '0x2271e3Fef9e15046d09E1d78a8FF038c691E9Cf9';
const ILendingPoolAddressesProvider = '0x178113104fEcbcD7fF8669a0150721e231F0FD4B';

const token_abi = ['function transfer(address,uint256) external',
    'function balanceOf(address) external view returns(uint256)',
    'function approve(address,uint256) external'];

async function deploy(owner) {
    const signer = await hre.ethers.getSigner();
    console.log("Deployer account:", signer.address);

    const Token = await hre.ethers.getContractFactory("LPToken");
    const token = await Token.deploy();
    await token.deployed();

    console.log('Token deployed successfully at:', token.address)

    const Custodian = await hre.ethers.getContractFactory("Custodian");
    const custodian = await Custodian.deploy(token.address, usdc_address,
        aUsdc_address, ILendingPoolAddressesProvider, { gasLimit: 10000000 });

    await custodian.deployed()
    console.log('Custodian deployed successfully at:', custodian.address)

    await token.transferOwnership(custodian.address)
    console.log('LP Token ownership transferred to custodian contract')

    const Repayment = await hre.ethers.getContractFactory("RepaymentPool");
    const repayment = await Repayment.deploy(usdc_address, custodian.address, { gasLimit: 10000000 });
    await repayment.deployed()
    console.log('Repayment pool deployed successfully at:', repayment.address)

    await custodian.setRepaymentPool(repayment.address)
    console.log("Repayment pool successfully set in custodian contract")

    await custodian.transferOwnership(owner);
    console.log('Ownership of custodian transferred to', owner);
    await repayment.transferOwnership(owner);
    console.log('Ownership of repayment pool transferred to', owner);

    return { token: token, custodian: custodian, repayment: repayment };
}

async function main() {
    const signer = await hre.ethers.getSigner();
    const { token, custodian, repayment } = await deploy(signer.address)

    const usdc = new ethers.Contract(usdc_address, token_abi, signer)
    await usdc.approve(custodian.address, 100000000)
    await custodian.deposit(100000000, signer.address)

    console.log("Defi:", await custodian.defiBalance())
    console.log("Reserve:", await custodian.reserveBalance())

    await custodian.withdrawToSafe(110)

    console.log("Defi:", await custodian.defiBalance())
    console.log("Reserve:", await custodian.reserveBalance())

    await custodian.withdrawToSafe(80000000)

    console.log("Defi:", await custodian.defiBalance())
    console.log("Reserve:", await custodian.reserveBalance())

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

