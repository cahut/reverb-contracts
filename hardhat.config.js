require("@nomiclabs/hardhat-waffle");
require('@openzeppelin/hardhat-upgrades');
require('dotenv').config()

const chai = require('chai');
const chaiAlmost = require('chai-almost');

chai.use(chaiAlmost());

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
      },
      {
        version: "0.7.0",
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/2sB00tJWxrkNvEpYpnRlit4ElRz88l9W",
        blockNumber: 14113438
      }
      /*
      forking: {
        url: 'https://polygon-mumbai.g.alchemy.com/v2/A0fTvH0AHgcGiM3CIwiy1PPYVOQevIiA',
      }*/
    },
    mumbai: {
      url: 'https://polygon-mumbai.g.alchemy.com/v2/A0fTvH0AHgcGiM3CIwiy1PPYVOQevIiA',
      accounts: [process.env.PRIVATE_KEY],
      gas: 10000000
    },
    rinkeby: {
      url: 'https://eth-rinkeby.alchemyapi.io/v2/SRT3zNXMzciLptZL7vrQU6sdQF0q-MIy',
      accounts: [process.env.PRIVATE_KEY],
      gas: 10000000
    }

  }
};
