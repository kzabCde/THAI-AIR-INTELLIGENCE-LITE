import unittest
from training import balanced_activation_policy_v1 as p

BASE=dict(test_skill=.046,validation_skill=.046,validation_mae=4.0,persistence_validation_mae=4.5,
          test_rows=365,validation_rows=365,high_pm_support=15,high_pm_mae=10,
          high_pm_persistence_mae=9,native_portable_parity=True,source_qa_passed=True)
class PolicyTests(unittest.TestCase):
 def test_standard(self):
  r=p.decide_regression_candidate(**BASE);self.assertTrue(r['eligible']);self.assertEqual(r['grade'],'standard')
 def test_conditional(self):
  r=p.decide_regression_candidate(**{**BASE,'test_skill':.043,'validation_skill':.042});self.assertTrue(r['eligible']);self.assertEqual(r['grade'],'conditional')
 def test_below_floor(self):
  r=p.decide_regression_candidate(**{**BASE,'test_skill':.039});self.assertFalse(r['eligible'])
 def test_high_pm_safety(self):
  r=p.decide_regression_candidate(**{**BASE,'high_pm_mae':12});self.assertFalse(r['eligible'])
 def test_qa(self):
  r=p.decide_regression_candidate(**{**BASE,'source_qa_passed':False});self.assertFalse(r['eligible'])
 def test_critical_parity(self):
  r=p.decide_regression_candidate(**{**BASE,'native_portable_parity':False});self.assertFalse(r['eligible'])
 def test_insufficient(self):
  r=p.decide_regression_candidate(**{**BASE,'test_rows':350});self.assertFalse(r['eligible'])
 def test_training_failure(self):
  r=p.decide_regression_candidate(**{**BASE,'other_training_failures':('severe_overfitting',)});self.assertFalse(r['eligible'])
 def test_champion_hold(self):
  r=p.decide_regression_candidate(**{**BASE,'champion_present':True,'champion_validation_mae':3.9});self.assertFalse(r['eligible'])
 def test_champion_replace(self):
  r=p.decide_regression_candidate(**{**BASE,'champion_present':True,'champion_validation_mae':4.15});self.assertTrue(r['eligible'])
 def test_conditional_requires_high_pm_evidence(self):
  r=p.decide_regression_candidate(**{**BASE,'test_skill':.041,'validation_skill':.044,'high_pm_support':4});self.assertFalse(r['eligible'])
if __name__=='__main__':unittest.main()
