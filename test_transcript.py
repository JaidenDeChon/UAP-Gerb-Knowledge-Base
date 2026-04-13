#!/usr/bin/env python3
"""
Quick diagnostic script to test if YouTube transcript fetching works.
"""

def test_transcript_fetch(video_id: str, cookies_path: str = None):
    """Test all possible methods of fetching a transcript."""
    
    print(f"\n🔍 Testing transcript fetch for video ID: {video_id}\n")
    
    # Test 1: New API (instance-based)
    print("Test 1: New API (instance-based, >= 0.6.0)")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        if cookies_path:
            api = YouTubeTranscriptApi(cookies=cookies_path)
        else:
            api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id)
        text = " ".join(seg.text for seg in fetched)
        print(f"  ✅ SUCCESS - {len(text)} characters")
        print(f"  First 200 chars: {text[:200]}...")
        return True
    except Exception as e:
        print(f"  ❌ FAILED: {type(e).__name__}: {e}")
    
    # Test 2: Old API (class-based)
    print("\nTest 2: Old API (class-based, < 0.6.0)")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US"])
        text = " ".join(seg["text"] for seg in transcript_list)
        print(f"  ✅ SUCCESS - {len(text)} characters")
        print(f"  First 200 chars: {text[:200]}...")
        return True
    except Exception as e:
        print(f"  ❌ FAILED: {type(e).__name__}: {e}")
    
    # Test 3: Old API without language spec
    print("\nTest 3: Old API without language specification")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(seg["text"] for seg in transcript_list)
        print(f"  ✅ SUCCESS - {len(text)} characters")
        print(f"  First 200 chars: {text[:200]}...")
        return True
    except Exception as e:
        print(f"  ❌ FAILED: {type(e).__name__}: {e}")
    
    # Test 4: List available transcripts
    print("\nTest 4: Check available transcripts")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        print(f"  Available transcripts:")
        for transcript in transcript_list:
            print(f"    - {transcript.language} ({transcript.language_code})")
            if transcript.is_generated:
                print(f"      (auto-generated)")
            if transcript.is_translatable:
                print(f"      (translatable)")
    except Exception as e:
        print(f"  ❌ FAILED: {type(e).__name__}: {e}")
    
    return False


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Test YouTube transcript fetching with diagnostic output."
    )
    parser.add_argument(
        "--video-id",
        type=str,
        default="0kLSp0lH-JQ",
        help="Video ID to test (default: 0kLSp0lH-JQ - first video from UAP Gerb)",
    )
    parser.add_argument(
        "--cookies",
        type=str,
        default=None,
        help="Path to Netscape-format cookies.txt file",
    )
    parser.add_argument(
        "--new-only",
        action="store_true",
        help="(Ignored - for compatibility with fetch_transcripts.py flags)",
    )
    
    args = parser.parse_args()
    
    print("="*70)
    print("YouTube Transcript Fetch Diagnostic")
    print("="*70)
    
    # Check library version
    try:
        from youtube_transcript_api import __version__
        print(f"\nyoutube-transcript-api version: {__version__}")
    except:
        print("\n⚠️  Could not determine youtube-transcript-api version")
    
    # Check SSL
    import ssl
    print(f"SSL version: {ssl.OPENSSL_VERSION}")
    
    # Show cookies status
    if args.cookies:
        print(f"Using cookies: {args.cookies}")
    
    success = test_transcript_fetch(args.video_id, args.cookies)
    
    if success:
        print("\n✅ Transcript fetching works! The issue might be with:")
        print("   - Rate limiting due to parallel requests")
        print("   - Specific videos not having transcripts")
        print("\n   Suggestions:")
        print("   1. Try: python fetch_transcripts.py --limit 5")
        print("   2. Increase delays between requests")
    else:
        print("\n❌ Could not fetch transcript. Possible causes:")
        print("   1. SSL/TLS compatibility issue (LibreSSL vs OpenSSL)")
        print("   2. youtube-transcript-api library needs updating")
        print("   3. Network/firewall blocking requests")
        print("\n   Try:")
        print("   1. pip install --upgrade youtube-transcript-api")
        print("   2. pip install --upgrade urllib3 requests")
        print("   3. Check if you can access YouTube in a browser")
