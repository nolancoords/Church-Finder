import pythonbible as bible

verse_id = bible.get_verse_id(bible.Book.JOHN, 3, 16)
text = bible.get_verse_text(verse_id)

print(text)