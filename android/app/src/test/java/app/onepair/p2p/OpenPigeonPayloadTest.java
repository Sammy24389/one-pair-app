package app.onepair.p2p;

import org.junit.Test;
import static org.junit.Assert.*;

public class OpenPigeonPayloadTest {
    @Test public void preservesOpaquePayloadWithoutDecoding() {
        String payload = "data:?ver=52&data=a%2Bb+%25&unknown=x";
        assertTrue(OpenPigeonPayload.valid("guid", "session", payload));
        assertEquals("data:?ver=52&data=a%2Bb+%25&unknown=x", payload);
    }
    @Test public void rejectsMissingOrUnsafeIdentifiers() {
        assertFalse(OpenPigeonPayload.valid("", "session", "data:?x"));
        assertFalse(OpenPigeonPayload.valid("guid", "", "data:?x"));
        assertFalse(OpenPigeonPayload.valid("guid", "with space", "data:?x"));
        assertFalse(OpenPigeonPayload.valid("guid", "a".repeat(257), "data:?x"));
    }
    @Test public void boundsBytesRatherThanCharacters() {
        assertTrue(OpenPigeonPayload.valid("guid", "s", "data:?" + "x".repeat(89994)));
        assertFalse(OpenPigeonPayload.valid("guid", "s", "data:?" + "x".repeat(89995)));
        assertFalse(OpenPigeonPayload.valid("guid", "s", "data:?" + "é".repeat(45000)));
    }
    @Test public void rejectsExternalUrlsAndNulls() {
        assertFalse(OpenPigeonPayload.valid("guid", "s", "https://example.com"));
        assertFalse(OpenPigeonPayload.valid("guid", "s", null));
    }
}
