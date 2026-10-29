"""Shared cooperative cancellation signal for local media analysis."""


class AnalysisCancelled(Exception):
    """Raised when a user requests cancellation of an analysis job."""


def check_cancelled(cancelled) -> None:
    if cancelled is not None and cancelled():
        raise AnalysisCancelled("Analysis cancelled")
