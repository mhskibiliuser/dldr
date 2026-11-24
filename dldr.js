import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import okhttp3.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class JavSearch {

    // Configuration
    private static final String NYAA_RSS = "https://sukebei.nyaa.si/rss?search=%s&category=0_0";
    
    // Fallback Sites Chain
    private static final List<SiteConfig> SITES = List.of(
        new SiteConfig("JavLibrary", "https://javlibrary.com/search.php?keyword=%s", "//a[contains(@class,'movie')]"),
        new SiteConfig("JavBus", "https://www.javbus.com/search/%s", "//a[contains(@class,'movie')]"),
        new SiteConfig("JavDB", "https://javdb.com/search?q=%s", "//a[contains(@class,'movie')]")
    );

    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build();

    public static void main(String[] args) {
        if (args.length == 0) {
            System.out.println("Usage: java JavSearch <search_term>");
            return;
        }

        String query = String.join(" ", args);
        System.out.println("--- Searching for: " + query + " ---\n");

        // 1. Try Nyaa/Sukebei First
        searchNyaa(query);

        // 2. Fallback to Streaming Sites
        searchStreamingSites(query);
    }

    private static void searchNyaa(String query) {
        try {
            String rssUrl = String.format(NYAA_RSS, query.replace(" ", "+"));
            Request request = new Request.Builder().url(rssUrl).get().build();
            
            Response response = client.newCall(request).execute();
            if (!response.isSuccessful()) return;

            String xml = response.body().string();
            // Simple XML parsing for RSS (using Jsoup since it handles XML well too)
            Document doc = Jsoup.parse(xml, "", Parser.xmlParser());
            Elements items = doc.select("item");

            if (items.isEmpty()) {
                System.out.println("❌ No torrents found on Nyaa/Sukebei.");
            } else {
                System.out.println("✅ Found Torrents on Nyaa/Sukebei:");
                int count = 0;
                for (Element item : items) {
                    if (count++ >= 5) break; // Limit to 5 results
                    String title = item.selectFirst("title") != null ? item.selectFirst("title").text() : "Unknown";
                    String link = item.selectFirst("link") != null ? item.selectFirst("link").text() : "";
                    
                    // Extract magnet link from enclosure or links
                    Element enclosure = item.selectFirst("enclosure");
                    String magnet = "";
                    if (enclosure != null && enclosure.attr("type").contains("magnet")) {
                        magnet = enclosure.attr("url");
                    }

                    System.out.printf("%d. %s\n   Link: %s\n   Magnet: %s\n\n", 
                            count, title, link, magnet.isEmpty() ? "N/A" : magnet);
                }
            }
        } catch (Exception e) {
            System.out.println("⚠️ Nyaa Error: " + e.getMessage());
        }
    }

    private static void searchStreamingSites(String query) {
        System.out.println("\n--- Fallback: Searching Streaming Sites ---");
        
        for (SiteConfig site : SITES) {
            System.out.println("🔍 Trying " + site.name + "...");
            List<Result> results = scrapeSite(site, query);
            
            if (!results.isEmpty()) {
                System.out.println("  ✅ Success! Found " + results.size() + " results on " + site.name);
                printResults(results);
                return; // Stop after first successful site
            } else {
                System.out.println("  ❌ No results or blocked on " + site.name + ", trying next...");
            }
        }
        System.out.println("❌ All streaming sites failed.");
    }

    private static List<Result> scrapeSite(SiteConfig site, String query) {
        try {
            String url = String.format(site.urlTemplate, query.replace(" ", "+"));
            Document doc = Jsoup.connect(url)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .timeout(10000)
                    .get();

            List<Result> results = new ArrayList<>();
            Elements movieElements = doc.select(site.cssSelector);

            for (Element el : movieElements) {
                String href = el.attr("href");
                if (href.startsWith("http")) continue; // Skip absolute nav links
                
                String fullUrl = href.startsWith("//") ? "https:" + href : href;
                if (!fullUrl.startsWith("http")) fullUrl = "https://" + fullUrl;

                String title = el.text().trim();
                boolean isUncen = title.toLowerCase().contains("uncensored") || 
                                 title.toLowerCase().contains("uncen") ||
                                 fullUrl.contains("uncensored");

                results.add(new Result(title, fullUrl, isUncen, site.name));
            }
            
            // Sort Uncensored first
            results.sort((a, b) -> Boolean.compare(b.isUncen, a.isUncen));
            return results.subList(0, Math.min(results.size(), 10));

        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    private static void printResults(List<Result> results) {
        System.out.println("\n📺 Final Results:");
        for (int i = 0; i < results.size(); i++) {
            Result r = results.get(i);
            System.out.printf("%d. %s %s\n   Page: %s\n\n", 
                    i + 1, r.title, r.isUncen ? "[UNCEN]" : "[CENSORED]", r.url);
            
            // Optional: Extract direct link for the first result
            if (i == 0) {
                System.out.println("   🎬 Attempting direct link extraction...");
                String directLink = extractDirectLink(r.url);
                if (directLink != null) {
                    System.out.println("   Direct Link: " + directLink);
                } else {
                    System.out.println("   (No direct link found)");
                }
            }
        }
    }

    private static String extractDirectLink(String pageUrl) {
        try {
            Document doc = Jsoup.connect(pageUrl)
                    .userAgent("Mozilla/5.0")
                    .timeout(10000)
                    .get();
            
            // Look for video tag
            Element video = doc.selectFirst("video source");
            if (video != null) return video.attr("src");
            
            // Look for script tags containing mp4/m3u8
            for (Element script : doc.select("script")) {
                String content = script.html();
                if (content.contains(".mp4") || content.contains(".m3u8")) {
                    // Simple regex to find URL
                    java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"(https?://[^\"\\']+\\.(?:mp4|m3u8))\"").matcher(content);
                    if (m.find()) return m.group(1);
                }
            }
        } catch (IOException e) {}
        return null;
    }

    // Helper Classes
    static class SiteConfig {
        String name;
        String urlTemplate;
        String cssSelector;
        
        SiteConfig(String name, String urlTemplate, String cssSelector) {
            this.name = name;
            this.urlTemplate = urlTemplate;
            this.cssSelector = cssSelector;
        }
    }

    static class Result {
        String title;
        String url;
        boolean isUncen;
        String source;

        Result(String title, String url, boolean isUncen, String source) {
            this.title = title;
            this.url = url;
            this.isUncen = isUncen;
            this.source = source;
        }
    }
}
