package app.onepair.p2p;

import com.openbubbles.openpigeon.Cryption;
import java.net.URLDecoder;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

final class OpenPigeonGameMetadata {
    private OpenPigeonGameMetadata() {}

    static boolean completed(String url) {
        if (url == null || !url.startsWith("data:?") || url.length() > 90000) return false;
        try {
            String encrypted = parameter(url.substring(5), "data");
            if (encrypted == null || encrypted.isEmpty()) return false;
            String winner = parameter(Cryption.INSTANCE.decrypt(encrypted), "winner");
            if (winner == null) return false;
            String[] parts = winner.split("\\|", -1);
            return parts.length == 2 && !parts[0].trim().isEmpty()
                && (parts[1].equals("1") || parts[1].equals("0") || parts[1].equals("-1"));
        } catch (RuntimeException malformed) {
            return false;
        }
    }

    private static String parameter(String query, String key) {
        if (!query.startsWith("?")) return null;
        for (String pair : query.substring(1).split("&")) {
            int separator = pair.indexOf('=');
            if (separator >= 0 && decode(pair.substring(0, separator)).equals(key)) {
                return decode(pair.substring(separator + 1));
            }
        }
        return null;
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
