// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "hardhat/console.sol";
import "./interfaces/ICustodian.sol";
import "./interfaces/IRepaymentPool.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RepaymentPool is IRepaymentPool, Ownable {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;

    struct Deal {
        uint256 amountPaid; // amount paid so far
        uint256 totalAmount; // total amount (principal + interest)
        uint256 startTime;
        uint256 endTime;
        uint256 dealId; // should be equal to the mapping index
        uint16 installments; // number of payment installments
        uint16 interestRate; // in 10's of a percent
        string description; // short description, e.g. company name
    }

    IERC20 public immutable usdc;
    ICustodian public immutable custodian;

    mapping(uint256 => Deal) dealList;
    Counters.Counter dealCount;

    constructor(IERC20 _usdc, ICustodian _custodian) {
        usdc = _usdc;
        custodian = _custodian;
    }

    function repay(
        uint256 dealId,
        uint256 amount,
        uint256 interest
    ) external override {
        Deal memory deal = dealList[dealId];
        require(deal.dealId == dealId, "Invalid deal ID");
        require(deal.amountPaid < deal.totalAmount, "Deal has been repaid");

        usdc.safeTransferFrom(
            msg.sender,
            address(custodian),
            amount + interest
        );
        custodian.registerRepayment(amount);

        dealList[dealId].amountPaid = amount + interest;
    }

    function createDeal(
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        uint16 installments,
        uint16 interestRate,
        string memory description
    ) external override onlyOwner {
        dealCount.increment();
        uint256 currentId = dealCount.current();

        dealList[currentId] = Deal({
            amountPaid: 0,
            totalAmount: totalAmount,
            startTime: startTime,
            endTime: endTime,
            installments: installments,
            interestRate: interestRate,
            dealId: currentId,
            description: description
        });

        emit DealCreated(currentId);
    }

    function getLastDealId() external view override returns (uint256) {
        return dealCount.current();
    }

    function getActiveDealIds()
        external
        view
        override
        returns (uint256[] memory)
    {
        uint256 activeDealCount;
        for (uint256 i = 1; i < dealCount.current(); ++i) {
            if (dealList[i].amountPaid < dealList[i].totalAmount) {
                ++activeDealCount;
            }
        }

        uint256[] memory activeDealIds = new uint256[](activeDealCount);
        uint256 index;

        for (uint256 i = 1; i < dealCount.current(); ++i) {
            if (dealList[i].amountPaid < dealList[i].totalAmount) {
                activeDealIds[index] = i;
                ++index;
            }
        }
        return activeDealIds;
    }
}
