// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IRepaymentPool {
    event Repayment(
        uint256 indexed dealId,
        uint256 principal,
        uint256 interest
    );
    event DealCreated(uint256 indexed dealId);

    function repay(
        uint256 dealId,
        uint256 amount,
        uint256 interest
    ) external;

    function createDeal(
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        uint16 installments,
        uint16 interestRate,
        string memory description
    ) external;

    function getLastDealId() external view returns (uint256);

    function getActiveDealIds() external view returns (uint256[] memory);
}
