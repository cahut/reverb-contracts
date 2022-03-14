// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "hardhat/console.sol";

import "./interfaces/ICustodian.sol";
import "./interfaces/ILPToken.sol";
import "./interfaces/IRepaymentPool.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";

contract Custodian is Ownable, ICustodian {
    using SafeERC20 for IERC20;
    // no-defi
    ILPToken public immutable lpToken;
    IRepaymentPool public repaymentPool;

    IERC20 public immutable usdc;
    IERC20 public immutable aUsdc;
    ILendingPoolAddressesProvider public immutable aaveAddresses;
    ILendingPool public immutable aavePool;

    uint256 public investedBalance; // balance invested in real-life contracts
    uint256 constant tolerance = 50; // pool balancing tolerance, in 1/1000th
    uint256 constant baseReserveShare = 200; // portion of liquidity to keep as reserve, in 1/1000th

    constructor(
        ILPToken _lpToken,
        IERC20 _usdc,
        IERC20 _aUsdc,
        ILendingPoolAddressesProvider _aaveAddresses
    ) {
        lpToken = _lpToken;
        usdc = _usdc;
        aUsdc = _aUsdc;
        aaveAddresses = _aaveAddresses;
        aavePool = ILendingPool(_aaveAddresses.getLendingPool());
    }

    /// @notice Allows users to deposit USDC into the pool and receive newly minted LP
    function deposit(uint256 usdcAmount, address onBehalfOf) external override {
        require(usdcAmount > 0, "Deposit amount is 0");
        uint256 lpMintAmount = calculateNewUsdcToLp(usdcAmount);

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        lpToken.mint(onBehalfOf, lpMintAmount);
        rebalanceReserve();

        emit Deposit(onBehalfOf, usdcAmount);
    }

    /// @notice Allows users to convert a given LP amount into USDC from the pool
    function redeem(uint256 lpAmount) external override {
        require(lpAmount > 0, "LP amount is 0");

        uint256 usdcWithdrawalAmount = convertLpToUsdc(lpAmount);
        if (reserveBalance() < usdcWithdrawalAmount) {
            require(
                usdcWithdrawalAmount <= getAvailableBalance(),
                "Reserve funds too low"
            );
            withdrawAave(usdcWithdrawalAmount - reserveBalance());
        }

        lpToken.burnFrom(msg.sender, lpAmount); // check what happens if LP contract throws
        usdc.safeTransfer(msg.sender, usdcWithdrawalAmount);
        rebalanceReserve();

        emit LpRedeemed(msg.sender, lpAmount, usdcWithdrawalAmount);
    }

    /// @notice Withdraws a given USDC amount into the safe, which is the owner
    /// of the contract
    function withdrawToSafe(uint256 usdcAmount) external override onlyOwner {
        if (reserveBalance() < usdcAmount) {
            require(
                usdcAmount <= getAvailableBalance(),
                "Reserve funds too low"
            );

            withdrawAave(usdcAmount - reserveBalance());
        }

        investedBalance += usdcAmount;
        usdc.safeTransfer(owner(), usdcAmount);
        rebalanceReserve();

        emit WithdrawalToSafe(usdcAmount);
    }

    /// @notice Rebalances amounts in reserve and the Aave pool according to
    /// the hardcoded baseReserveShare proportion
    function rebalanceReserve() internal {
        uint256 reserveUsdcBalance = reserveBalance();
        uint256 defiUsdcBalance = defiBalance();
        uint256 availableBalance = reserveUsdcBalance + defiUsdcBalance;

        if (availableBalance == 0) {
            return;
        }

        uint256 reserveShare = (reserveUsdcBalance * 1000) / availableBalance;
        console.log("Reserve share:", reserveShare);
        console.log("Base share:", baseReserveShare);
        console.log("Tolerance:", tolerance);

        if (reserveShare > baseReserveShare + tolerance) {
            uint256 differenceBalance = ((reserveShare - baseReserveShare) *
                availableBalance) / 1000;
            depositAave(differenceBalance);
        } else if (reserveShare < baseReserveShare - tolerance) {
            uint256 differenceBalance = ((baseReserveShare - reserveShare) *
                availableBalance) / 1000;
            withdrawAave(differenceBalance);
        }
        //
        console.log("First case:", reserveShare > baseReserveShare + tolerance);
        console.log(
            "Second case:",
            reserveShare < baseReserveShare - tolerance
        );
    }

    /// @notice Registers a deal repayment for the principal amount
    /// @dev Can only be called from the repayment pool function `repay``
    /// added a safeguard in the investedBalance decrement in order to avoid
    /// incorrect accounting from causing underflow and blocking the entire function
    function registerRepayment(uint256 amount) external override {
        require(
            msg.sender == address(repaymentPool),
            "Caller is not repayment pool"
        );

        amount <= investedBalance
            ? investedBalance -= amount
            : investedBalance = 0;
    }

    /// @notice Setter function for repaymentPool
    function setRepaymentPool(IRepaymentPool _repaymentPool)
        external
        onlyOwner
    {
        repaymentPool = _repaymentPool;
    }

    /// @notice Helper function to withdraw a given USDC amount from Aave
    function withdrawAave(uint256 aUsdcAmount) internal {
        require(
            defiBalance() >= aUsdcAmount,
            "Withdrawal amount exceeds aUSDC balance"
        );

        aUsdc.safeIncreaseAllowance(address(aavePool), aUsdcAmount);
        aavePool.withdraw(address(usdc), aUsdcAmount, address(this));
    }

    /// @notice Helper function to deposit a given USDC amount into Aave
    function depositAave(uint256 usdcAmount) internal {
        require(
            usdcAmount <= reserveBalance(),
            "Deposit amount exceeds reserve balance"
        );

        usdc.safeIncreaseAllowance(address(aavePool), usdcAmount);
        aavePool.deposit(address(usdc), usdcAmount, address(this), 0);
    }

    /// @notice Helper function used to calculate the amount of LP to mint
    /// for a given amount of USDC. Only use if the USDC amount in question
    /// is being deposited into the pool. To convert pool USDC to LP tokens,
    /// see `convertUsdcToLp(uint256 usdcAmount)`
    function calculateNewUsdcToLp(uint256 usdcAmount)
        public
        view
        override
        returns (uint256)
    {
        uint256 totalLpSupply = lpToken.totalSupply();

        if (totalLpSupply == 0) {
            return usdcAmount;
        }

        uint256 totalUsdcBalance = getTotalBalance();

        uint256 shareOfNewBalance = (usdcAmount * 10**6) /
            (totalUsdcBalance + usdcAmount);

        return
            (shareOfNewBalance * totalLpSupply) / (10**6 - shareOfNewBalance); // add multiplier
    }

    /// @notice Helper function used to convert USDC that exists in the pool
    /// into LP tokens. For new USDC being deposited into the pool, see
    /// `calculateNewUsdcToLp(uint256 usdcAmount)`
    function convertUsdcToLp(uint256 usdcAmount)
        public
        view
        override
        returns (uint256)
    {
        uint256 totalLpSupply = lpToken.totalSupply();
        uint256 totalUsdcBalance = getTotalBalance();

        return
            (totalLpSupply * usdcAmount * 10**6) / (totalUsdcBalance * 10**6);
    }

    /// @notice Helper function used to convert LP tokens into USDC
    function convertLpToUsdc(uint256 lpAmount)
        public
        view
        override
        returns (uint256)
    {
        uint256 totalLpSupply = lpToken.totalSupply();
        uint256 totalUsdcBalance = getTotalBalance();

        return (totalUsdcBalance * lpAmount * 10**6) / (totalLpSupply * 10**6);
    }

    /// @notice Returns idle USDC balance in the reserve pool
    function reserveBalance() public view override returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Returns aUSDC balance in the Aave USDC pool
    function defiBalance() public view override returns (uint256) {
        return aUsdc.balanceOf(address(this));
    }

    /// @notice returns total balance in invested deals and in the pool
    function getTotalBalance() public view override returns (uint256) {
        return getAvailableBalance() + investedBalance;
    }

    /// @notice returns balance in the pool (reserve plus Aave)
    function getAvailableBalance() public view override returns (uint256) {
        return reserveBalance() + defiBalance();
    }

    /// @notice returns pool data, including data on a particular user
    /// @return address of the pool; total balance in and out of deals;
    /// balance out of deals; balance in deals; LP token balance of user;
    /// equivalent USDC share of user; total supply of LP tokens;
    function getPoolData(address user)
        external
        view
        override
        returns (
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        address poolAddress = address(this);
        uint256 totalBalance = getTotalBalance();
        uint256 unallocatedBalance = getAvailableBalance();
        uint256 dealBalance = investedBalance;

        uint256 userLpBalance = lpToken.balanceOf(user);
        uint256 userUsdcBalance = convertLpToUsdc(userLpBalance);
        uint256 totalLpBalance = lpToken.totalSupply();

        return (
            poolAddress,
            totalBalance,
            unallocatedBalance,
            dealBalance,
            totalLpBalance,
            userLpBalance,
            userUsdcBalance
        );
    }
}
