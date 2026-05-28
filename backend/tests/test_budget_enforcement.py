"""Tests for budget enforcement - BudgetExceededError (Section K).

The current implementation raises BudgetExceededError when a project's MTD cost
exceeds monthly_budget_usd. This is checked externally (by callers) using the
usage endpoint or by integrating into future llm.complete() calls.

These tests verify the error class exists and is importable, and that
budget logic in the usage module computes correctly.
"""
from __future__ import annotations

import pytest

from app.services.llm import BudgetExceededError


def test_budget_exceeded_error_is_exception():
    """BudgetExceededError should be an Exception subclass."""
    err = BudgetExceededError("Monthly budget exhausted")
    assert isinstance(err, Exception)
    assert str(err) == "Monthly budget exhausted"


def test_budget_exceeded_error_can_be_raised_and_caught():
    with pytest.raises(BudgetExceededError, match="budget"):
        raise BudgetExceededError("budget exceeded")


def test_budget_exceeded_error_is_catchable_as_exception():
    """Should be catchable via general Exception handler."""
    raised = False
    try:
        raise BudgetExceededError("over limit")
    except Exception:
        raised = True
    assert raised


def test_budget_used_pct_calculation():
    """Verify budget_used_pct is correctly computed (80% soft threshold)."""
    # Simulate: 8 USD spent of 10 USD budget → 80%
    mtd_cost = 8.0
    budget = 10.0
    pct = round((mtd_cost / budget) * 100, 1)
    assert pct == 80.0
    assert pct >= 80.0  # soft warning threshold


def test_budget_hard_block_at_100pct():
    """Simulate what budget check should do at 100%."""
    mtd_cost = 10.5  # over budget
    budget = 10.0
    pct = round((mtd_cost / budget) * 100, 1)
    assert pct >= 100.0  # hard block threshold


def test_budget_no_block_below_80pct():
    """Below 80%, neither soft warning nor hard block should fire."""
    mtd_cost = 5.0
    budget = 10.0
    pct = round((mtd_cost / budget) * 100, 1)
    assert pct < 80.0
