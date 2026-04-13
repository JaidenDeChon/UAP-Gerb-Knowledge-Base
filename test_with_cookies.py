#!/usr/bin/env python3
"""Test YouTube transcript with cookies properly."""

import requests
from http.cookiejar import MozillaCookieJar
from youtube_transcript_api import YouTubeTranscriptApi

# Load cookies
jar = MozillaCookieJar('cookies.txt')
jar.load(ignore_discard=True, ignore_expires=True)

# Create session with cookies
session = requests.Session()
session.cookies = jar

# Create API instance with session
api = YouTubeTranscriptApi(http_client=session)

# Test fetch
try:
    transcript = api.fetch('0kLSp0lH-JQ')
    print(f"✅ Success! Got {len(transcript)} segments")
    text = " ".join(seg.text for seg in transcript)
    print(f"First 200 chars: {text[:200]}")
except Exception as e:
    print(f"❌ Failed: {type(e).__name__}: {e}")
