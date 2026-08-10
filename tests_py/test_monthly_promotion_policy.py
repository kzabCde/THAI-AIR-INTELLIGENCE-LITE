from training.promotion_policy import decide_promotion


def regression(mae=3.7, rmse=5.5, r2=0.81, skill=0.065):
    return {
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "skill_vs_persistence": skill,
    }


def classification(
    macro=0.58,
    bal=0.59,
    weighted=0.72,
    accuracy=0.71,
    r4=0.60,
    r5=0.54,
):
    return {
        "macro_f1": macro,
        "balanced_accuracy": bal,
        "weighted_f1": weighted,
        "accuracy": accuracy,
        "per_class": {
            "4": {"recall": r4, "support": 400},
            "5": {"recall": r5, "support": 40},
        },
    }


def provinces(mae=3.7):
    return {f"TH-{n}": {"mae": mae} for n in range(30, 50)}


def test_promotes_material_regression_gain_with_noninferior_classifier():
    result = decide_promotion(
        candidate_regression=regression(mae=3.65, skill=0.069),
        champion_regression=regression(),
        candidate_classification=classification(),
        champion_classification=classification(),
        candidate_regression_provinces=provinces(3.65),
        champion_regression_provinces=provinces(3.7),
        candidate_ready=True,
    )
    assert result["approved"] is True


def test_keeps_champion_when_candidate_gate_failed():
    result = decide_promotion(
        candidate_regression=regression(mae=3.6, skill=0.075),
        champion_regression=regression(),
        candidate_classification=classification(macro=0.60),
        champion_classification=classification(),
        candidate_regression_provinces=provinces(3.6),
        champion_regression_provinces=provinces(3.7),
        candidate_ready=False,
    )
    assert result["approved"] is False
    assert "candidate_deployment_gate_failed" in result["reasons"]


def test_keeps_champion_when_classifier_regresses():
    result = decide_promotion(
        candidate_regression=regression(mae=3.65, skill=0.069),
        champion_regression=regression(),
        candidate_classification=classification(macro=0.55, bal=0.55),
        champion_classification=classification(),
        candidate_regression_provinces=provinces(3.65),
        champion_regression_provinces=provinces(3.7),
        candidate_ready=True,
    )
    assert result["approved"] is False
    assert any(
        reason.startswith("classification_")
        for reason in result["reasons"]
    )


def test_keeps_champion_without_material_gain():
    result = decide_promotion(
        candidate_regression=regression(),
        champion_regression=regression(),
        candidate_classification=classification(),
        champion_classification=classification(),
        candidate_regression_provinces=provinces(),
        champion_regression_provinces=provinces(),
        candidate_ready=True,
    )
    assert result["approved"] is False
    assert "no_material_improvement" in result["reasons"]


def test_keeps_champion_when_one_province_regresses_over_two_percent():
    candidate_provinces = provinces()
    candidate_provinces["TH-34"] = {"mae": 4.0}
    result = decide_promotion(
        candidate_regression=regression(mae=3.65, skill=0.069),
        champion_regression=regression(),
        candidate_classification=classification(),
        champion_classification=classification(),
        candidate_regression_provinces=candidate_provinces,
        champion_regression_provinces=provinces(),
        candidate_ready=True,
    )
    assert result["approved"] is False
    assert any("TH-34" in reason for reason in result["reasons"])
