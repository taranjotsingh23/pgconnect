# The brief's Python reference tests (Appendix A9). Run from this folder:  python reference_tests.py
from datetime import date

from reference_rent import rent_status, schedule_dates
from reference_roommate import roommate_score, valid_answers

mine = [0, 1, 0, 1, 0, 1]
profiles = [[0, 0, 1, 1, 1, 1], [1, 1, 1, 0, 0, 1], [2, 2, 2, 2, 2, 2], [0, 1, 1, 1, 1, 0], [2, 1, 2, 2, 1, 2], [1, 1, 0, 1, 0, 1]]
assert [roommate_score(mine, p) for p in profiles] == [75, 73, 25, 83, 43, 88]
assert roommate_score([0] * 6, [0] * 6) == 100 and roommate_score([0] * 6, [2] * 6) == 0
assert roommate_score([0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]) == 88  # 87.5 -> 88
assert roommate_score([0, 0, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0]) == 93  # 92.5 -> 93 (round() would give 92)
assert valid_answers([0, 1, 2, 0, 1, 2]) and not valid_answers([0, 1, 2]) and not valid_answers([0, 1, 2, 0, 1, 3]) and not valid_answers([True] * 6)
print("python roommate ok")

d = date
assert rent_status(d(2026, 11, 1), None, False, d(2026, 10, 29)) == "upcoming"
assert rent_status(d(2026, 11, 1), None, False, d(2026, 11, 1)) == "due"
assert rent_status(d(2026, 11, 1), None, False, d(2026, 11, 6)) == "due"
assert rent_status(d(2026, 11, 1), None, False, d(2026, 11, 7)) == "overdue"
assert rent_status(d(2026, 11, 1), "2026-11-03", False, d(2026, 12, 30)) == "paid"
assert rent_status(d(2026, 11, 1), None, True, d(2026, 12, 30)) == "waived"
assert schedule_dates(d(2026, 12, 12), 3) == [d(2026, 12, 12), d(2027, 1, 1), d(2027, 2, 1)]
assert schedule_dates(d(2026, 11, 20), 3)[1:] == [d(2026, 12, 1), d(2027, 1, 1)]
assert len(schedule_dates(d(2026, 1, 5), 14)) == 14 and schedule_dates(d(2026, 1, 5), 14)[-1] == d(2027, 2, 1)
print("python rent ok")
