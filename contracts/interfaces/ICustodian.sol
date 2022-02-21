// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface ICustodian {
    event WithdrawalToSafe(uint256 amount);
    event Deposit(address indexed onBehalfOf, uint256 amount);
    event LpRedeemed(
        address indexed redeemer,
        uint256 lpAmount,
        uint256 usdcAmount
    );

    function deposit(uint256 amount, address onBehalfOf) external;

    function redeem(uint256 lpAmount) external;

    function withdrawToSafe(uint256 amount) external;

    function registerRepayment(uint256 amount) external;

    function getPoolData(address user)
        external
        view
        returns (
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        );

    function getAvailableBalance() external view returns (uint256);

    function getTotalBalance() external view returns (uint256);

    function calculateNewUsdcToLp(uint256 usdcAmount)
        external
        view
        returns (uint256);

    function convertLpToUsdc(uint256 lpAmount) external view returns (uint256);

    function convertUsdcToLp(uint256 usdcAmount)
        external
        view
        returns (uint256);

    function reserveBalance() external view returns (uint256);

    function defiBalance() external view returns (uint256);
}
