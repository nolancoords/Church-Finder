from flask import Flask
from flask_API import verse_bp

app = Flask(__name__)
app.register_blueprint(verse_bp)

if __name__ == "__main__":
    app.run(port=5000)