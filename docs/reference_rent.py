# Reference module for a future FastAPI backend (brief Appendix A6). NOT used by the website.
# The demo backend in js/local-api-manage.js uses js/lib-core.js, which gives the same answers.
# Status is derived on read and never stored. Dates are in Asia/Kolkata.
from datetime import date, datetime
from zoneinfo import ZoneInfo

GRACE_DAYS = 5
IST = ZoneInfo("Asia/Kolkata")


def today_ist() -> date:
    return datetime.now(IST).date()


def rent_status(due: date, paid_at: str | None, waived: bool, today: date, grace: int = GRACE_DAYS) -> str:
    if paid_at:
        return "paid"
    if waived:
        return "waived"
    late = (today - due).days
    if late < 0:
        return "upcoming"
    return "due" if late <= grace else "overdue"


def schedule_dates(move_in: date, months: int) -> list[date]:
    """First row due on the move-in date; later rows due on the 1st of each following month."""
    out = [move_in]
    y, m = move_in.year, move_in.month
    for i in range(1, max(1, months)):
        mm = m - 1 + i
        out.append(date(y + mm // 12, mm % 12 + 1, 1))
    return out
