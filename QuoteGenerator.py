import random
import datetime
import pythonbible as bible
from flask import Blueprint, jsonify, request
 
verse_bp = Blueprint("verse_bp", __name__)
 
# ── Verse pool (book, chapter, verse_number)
VERSE_POOL = [
    (bible.Book.JOHN,           3,  16),
    (bible.Book.PSALMS,        23,   1),
    (bible.Book.PSALMS,        23,   4),
    (bible.Book.PSALMS,        46,   1),
    (bible.Book.PROVERBS,       3,   5),
    (bible.Book.PROVERBS,       3,   6),
    (bible.Book.ROMANS,         8,  28),
    (bible.Book.ROMANS,         8,  31),
    (bible.Book.ROMANS,        10,   9),
    (bible.Book.ROMANS,        12,   2),
    (bible.Book.MATTHEW,        5,   9),
    (bible.Book.MATTHEW,        5,  14),
    (bible.Book.MATTHEW,        6,  33),
    (bible.Book.MATTHEW,       11,  28),
    (bible.Book.ISAIAH,        40,  31),
    (bible.Book.ISAIAH,        41,  10),
    (bible.Book.JOSHUA,         1,   9),
    (bible.Book.GALATIANS,      5,  22),
    (bible.Book.PHILIPPIANS,    4,  13),
    (bible.Book.PHILIPPIANS,    4,   6),
    (bible.Book.HEBREWS,       11,   1),
    (bible.Book.JAMES,          1,   5),
    (bible.Book.JAMES,          1,   2),
]
 
_cache: dict = {"date": None, "verse": None}
 
 
def _today_utc() -> str:
    """Return today's date as 'YYYY-MM-DD' (UTC)."""
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")
 
 
def _pick_verse_for_day(date_str: str) -> dict:
    """
    Deterministically pick a verse for the given date string.
    Using the date as the seed means all server instances agree
    without any shared storage.
    """
    rng = random.Random(date_str)          # seeded with the date string
    book, chapter, verse_num = rng.choice(VERSE_POOL)
 
    verse_id = bible.get_verse_id(book, chapter, verse_num)
    text = bible.get_verse_text(verse_id)
 
    return {
        "book":    book.name,      # e.g. "JOHN"
        "chapter": chapter,
        "verse":   verse_num,
        "text":    text,
        "date":    date_str,
    }
 
 
def get_daily_verse(force: bool = False) -> dict:
    """
    Return the cached verse for today, refreshing if the date has
    changed or if force=True.
    """
    today = _today_utc()
    if force or _cache["date"] != today:
        _cache["verse"] = _pick_verse_for_day(today)
        _cache["date"]  = today
    return _cache["verse"]
 
@verse_bp.route("/api/verse")
def verse_endpoint():
    """
    GET /api/verse
    Optional query param:  ?refresh=1  forces a new verse (same day, random).
    Remove the refresh param support in production if you don't want this.
    """
    force = request.args.get("refresh", "0") == "1"
 
    if force:
        book, chapter, verse_num = random.choice(VERSE_POOL)
        verse_id = bible.get_verse_id(book, chapter, verse_num)
        text = bible.get_verse_text(verse_id)
        data = {
            "book":    book.name,
            "chapter": chapter,
            "verse":   verse_num,
            "text":    text,
            "date":    _today_utc(),
        }
    else:
        data = get_daily_verse()
 
    return jsonify(data)
