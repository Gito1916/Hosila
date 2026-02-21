"""
Unit tests for the tax engine — the most critical financial calculation module.
These tests use the standalone calculation function (no database needed).
"""

from decimal import Decimal
import pytest
from app.modules.tax_engine.service import calculate_tax_standalone, _round


class TestRounding:
    def test_round_half_up(self):
        assert _round(Decimal("10.555")) == Decimal("10.56")
        assert _round(Decimal("10.554")) == Decimal("10.55")
        assert _round(Decimal("10.005")) == Decimal("10.01")
        assert _round(Decimal("0.00")) == Decimal("0.00")

    def test_round_precision(self):
        assert _round(Decimal("99999.999")) == Decimal("100000.00")
        assert _round(Decimal("0.001")) == Decimal("0.00")


class TestStandaloneCalculation:
    """Test the pure calculation function with no database dependency."""

    def test_basic_all_taxes(self):
        """SC 10% + VAT 7.5% + TDL 5% on base of 10,000"""
        result = calculate_tax_standalone(
            base_amount=Decimal("10000"),
            sc_rate=Decimal("10"),
            vat_rate=Decimal("7.5"),
            tdl_rate=Decimal("5"),
            sc_enabled=True,
            vat_enabled=True,
            tdl_enabled=True,
        )
        assert result["base_amount"] == Decimal("10000")
        assert result["service_charge"] == Decimal("1000.00")
        assert result["vat"] == Decimal("750.00")
        assert result["tdl"] == Decimal("500.00")
        assert result["total"] == Decimal("12250.00")

    def test_vat_only(self):
        """VAT 7.5% on base of 15,000, no SC or TDL"""
        result = calculate_tax_standalone(
            base_amount=Decimal("15000"),
            vat_rate=Decimal("7.5"),
            sc_enabled=False,
            vat_enabled=True,
            tdl_enabled=False,
        )
        assert result["service_charge"] == Decimal("0")
        assert result["vat"] == Decimal("1125.00")
        assert result["tdl"] == Decimal("0")
        assert result["total"] == Decimal("16125.00")

    def test_no_taxes(self):
        """All taxes disabled"""
        result = calculate_tax_standalone(
            base_amount=Decimal("5000"),
            sc_enabled=False,
            vat_enabled=False,
            tdl_enabled=False,
        )
        assert result["total"] == Decimal("5000")
        assert result["service_charge"] == Decimal("0")
        assert result["vat"] == Decimal("0")
        assert result["tdl"] == Decimal("0")

    def test_zero_base(self):
        """Zero base amount should produce zero taxes"""
        result = calculate_tax_standalone(base_amount=Decimal("0"))
        assert result["total"] == Decimal("0")
        assert result["service_charge"] == Decimal("0")
        assert result["vat"] == Decimal("0")

    def test_small_amount_rounding(self):
        """Small amounts should round correctly (avoid floating point issues)"""
        result = calculate_tax_standalone(
            base_amount=Decimal("33.33"),
            sc_rate=Decimal("10"),
            vat_rate=Decimal("7.5"),
            sc_enabled=True,
            vat_enabled=True,
            tdl_enabled=False,
        )
        # SC: 33.33 × 0.10 = 3.333 → 3.33
        assert result["service_charge"] == Decimal("3.33")
        # VAT: 33.33 × 0.075 = 2.49975 → 2.50
        assert result["vat"] == Decimal("2.50")
        assert result["total"] == Decimal("39.16")

    def test_taxes_do_not_compound(self):
        """VAT and TDL are calculated on base, not base+SC or each other"""
        result = calculate_tax_standalone(
            base_amount=Decimal("10000"),
            sc_rate=Decimal("10"),
            vat_rate=Decimal("10"),
            tdl_rate=Decimal("10"),
            sc_enabled=True,
            vat_enabled=True,
            tdl_enabled=True,
        )
        # If taxes compounded: VAT on 11000 = 1100, TDL on 11000 = 1100
        # But they SHOULD NOT compound:
        assert result["service_charge"] == Decimal("1000.00")
        assert result["vat"] == Decimal("1000.00")   # 10% of base only
        assert result["tdl"] == Decimal("1000.00")   # 10% of base only
        assert result["total"] == Decimal("13000.00")

    def test_nigerian_standard_rates(self):
        """Nigerian standard: VAT 7.5%"""
        result = calculate_tax_standalone(
            base_amount=Decimal("25000"),
            vat_rate=Decimal("7.5"),
            sc_enabled=False,
            vat_enabled=True,
            tdl_enabled=False,
        )
        assert result["vat"] == Decimal("1875.00")
        assert result["total"] == Decimal("26875.00")

    def test_large_amount(self):
        """Large amount should not overflow or lose precision"""
        result = calculate_tax_standalone(
            base_amount=Decimal("99999999.99"),
            sc_rate=Decimal("10"),
            vat_rate=Decimal("7.5"),
            sc_enabled=True,
            vat_enabled=True,
            tdl_enabled=False,
        )
        assert result["service_charge"] == Decimal("10000000.00")
        assert result["vat"] == Decimal("7500000.00")
        assert result["total"] == Decimal("117499999.99")
