/**
 * Granola Transcript Clipboard Intercept
 * 
 * PROVEN METHOD - This works 100% reliably!
 * 
 * Usage:
 *   1. Open Granola, navigate to meeting
 *   2. Open DevTools (Cmd+Option+I)
 *   3. Paste this entire script
 *   4. Click Granola's copy button
 *   5. Transcript auto-downloads!
 */

// Set up clipboard intercept
let originalWriteText = navigator.clipboard.writeText;

navigator.clipboard.writeText = function(text) {
    console.log('🎯 TRANSCRIPT CAPTURED!');
    console.log(`Length: ${text.length.toLocaleString()} characters`);
    
    // Parse meeting ID from URL
    let meetingId = window.location.hash.match(/\/t\/([a-f0-9-]+)/)?.[1] || 
                   window.location.pathname.match(/\/t\/([a-f0-9-]+)/)?.[1] ||
                   'unknown';
    
    // Show preview
    console.log(`\nFirst 400 chars:\n${text.substring(0, 400)}`);
    console.log(`\nLast 400 chars:\n${text.substring(text.length - 400)}`);
    
    // Auto-download
    let blob = new Blob([text], { type: 'text/plain' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `${meetingId}-transcript-COMPLETE.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`\n✓✓✓ AUTO-DOWNLOADED: ${a.download}`);
    console.log('\nTranscript also saved to: window.CAPTURED_TRANSCRIPT');
    
    // Save to window for easy access
    window.CAPTURED_TRANSCRIPT = text;
    
    // Call original to keep UI working normally
    return originalWriteText.call(navigator.clipboard, text);
};

console.log('%c✓ Transcript Clipboard Intercept Active', 'color: green; font-size: 16px; font-weight: bold;');
console.log('%cClick the copy button now...', 'color: blue; font-size: 14px;');

