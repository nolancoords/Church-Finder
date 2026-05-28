import random
import datetime
import pythonbible as bible
from flask import Flask, Blueprint, jsonify, request

app = Flask(__name__)

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

_cache = {"date": None, "verse": None}

def _today_utc():
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")

def _pick_verse(date_str):
    rng = random.Random(date_str)
    book, chapter, verse_num = rng.choice(VERSE_POOL)
    verse_id = bible.get_verse_id(book, chapter, verse_num)
    text = bible.get_verse_text(verse_id)
    return {"book": book.name, "chapter": chapter, "verse": verse_num, "text": text, "date": date_str}

@app.route("/api/verse")
def verse_endpoint():
    today = _today_utc()
    force = request.args.get("refresh", "0") == "1"
    if force:
        book, chapter, verse_num = random.choice(VERSE_POOL)
        verse_id = bible.get_verse_id(book, chapter, verse_num)
        text = bible.get_verse_text(verse_id)
        return jsonify({"book": book.name, "chapter": chapter, "verse": verse_num, "text": text, "date": today})
    if _cache["date"] != today:
        _cache["verse"] = _pick_verse(today)
        _cache["date"] = today
    return jsonify(_cache["verse"])

if __name__ == "__main__":
    app.run(port=5000)