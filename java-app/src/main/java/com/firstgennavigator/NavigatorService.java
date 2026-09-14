package com.firstgennavigator;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class NavigatorService {
    private static final Gson GSON = new Gson();
    private final HttpClient http = HttpClient.newHttpClient();
    private final String apiKey;
    private final String baseUrl;

    public NavigatorService() {
        apiKey = System.getenv().getOrDefault("ANAKIN_API_KEY", "");
        baseUrl = System.getenv().getOrDefault("ANAKIN_BASE_URL", "https://api.anakin.io/v1");
    }

    public Roadmap build(Profile profile) {
        List<Roadmap.College> colleges = fallbackColleges(profile);
        List<Roadmap.Scholarship> scholarships = fallbackScholarships(profile);
        boolean live = false;
        String source = "Curated fallback data. Add ANAKIN_API_KEY to enable live research.";

        if (!apiKey.isBlank()) {
            try {
                JsonObject response = requestAgenticSearch(profile);
                List<Roadmap.College> liveColleges = extractColleges(response, profile);
                List<Roadmap.Scholarship> liveScholarships = extractScholarships(response, profile);
                if (!liveColleges.isEmpty() || !liveScholarships.isEmpty()) {
                    if (!liveColleges.isEmpty()) colleges = liveColleges;
                    if (!liveScholarships.isEmpty()) scholarships = liveScholarships;
                    live = true;
                    source = "Live Anakin Agentic Search data.";
                }
            } catch (Exception ignored) {
                source = "Live search unavailable; showing curated fallback data.";
            }
        }

        return new Roadmap(profile, colleges.stream().limit(5).toList(),
                scholarships.stream().limit(5).toList(), buildSop(profile),
                buildPlan(scholarships), live, source);
    }

    private JsonObject requestAgenticSearch(Profile profile) throws Exception {
        String prompt = "Research affordable Indian colleges and current scholarships for this first-generation student: "
                + profile.asMap() + ". Return JSON with colleges and scholarships arrays.";
        String body = GSON.toJson(Map.of("prompt", prompt));
        HttpRequest submit = HttpRequest.newBuilder(URI.create(baseUrl + "/agentic-search"))
                .header("Content-Type", "application/json").header("X-API-Key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        JsonObject result = JsonParser.parseString(http.send(submit, HttpResponse.BodyHandlers.ofString()).body()).getAsJsonObject();
        String jobId = string(result, "job_id", string(result, "jobId", string(result, "id", "")));
        if (jobId.isBlank()) throw new IllegalStateException("No Anakin job id returned");

        for (int attempt = 0; attempt < 36; attempt++) {
            Thread.sleep(10_000);
            HttpRequest poll = HttpRequest.newBuilder(URI.create(baseUrl + "/agentic-search/" + jobId))
                    .header("X-API-Key", apiKey).GET().build();
            JsonObject job = JsonParser.parseString(http.send(poll, HttpResponse.BodyHandlers.ofString()).body()).getAsJsonObject();
            String status = string(job, "status", "").toLowerCase(Locale.ROOT);
            if (List.of("completed", "complete", "succeeded", "success", "done").contains(status)) return job;
            if (List.of("failed", "error", "cancelled").contains(status)) throw new IllegalStateException("Anakin job failed");
        }
        throw new IllegalStateException("Timed out waiting for Anakin");
    }

    private List<Roadmap.College> extractColleges(JsonObject job, Profile profile) {
        JsonObject generated = object(job, "generatedJson", object(job, "generated_json", job));
        JsonElement data = generated.get("structured_data");
        if (data != null && data.isJsonObject()) generated = data.getAsJsonObject();
        List<Roadmap.College> result = new ArrayList<>();
        if (generated.has("colleges") && generated.get("colleges").isJsonArray()) {
            generated.getAsJsonArray("colleges").forEach(item -> {
                if (!item.isJsonObject()) return;
                JsonObject c = item.getAsJsonObject();
                result.add(new Roadmap.College(string(c, "name", "College option"),
                        string(c, "reason", "Matches the student profile."), string(c, "fees", "Check official fee page"),
                        string(c, "cutoff", "Check current cutoff"), string(c, "source", "Live source")));
            });
        }
        return result;
    }

    private List<Roadmap.Scholarship> extractScholarships(JsonObject job, Profile profile) {
        JsonObject generated = object(job, "generatedJson", object(job, "generated_json", job));
        JsonElement data = generated.get("structured_data");
        if (data != null && data.isJsonObject()) generated = data.getAsJsonObject();
        List<Roadmap.Scholarship> result = new ArrayList<>();
        if (generated.has("scholarships") && generated.get("scholarships").isJsonArray()) {
            generated.getAsJsonArray("scholarships").forEach(item -> {
                if (!item.isJsonObject()) return;
                JsonObject s = item.getAsJsonObject();
                result.add(new Roadmap.Scholarship(string(s, "name", "Scholarship option"),
                        string(s, "amount", "Amount varies"), string(s, "deadline", "Check current listing"),
                        string(s, "eligibility", "Eligibility varies"), string(s, "why", "May match this profile."),
                        string(s, "source", "Live source")));
            });
        }
        return result;
    }

    private List<Roadmap.College> fallbackColleges(Profile p) {
        return List.of(
                new Roadmap.College("NIT Jamshedpur", "Strong public engineering route without private-college fee pressure.", "Check official fee page", "JEE Main cutoff varies", "JoSAA"),
                new Roadmap.College("BIT Sindri", "A realistic state engineering choice for a Jharkhand student watching cost.", "Check official fee page", "JEE Main cutoff varies", "Jharkhand counselling"),
                new Roadmap.College("Jadavpur University", "Excellent value if the student is open to West Bengal.", "Check official fee page", "WBJEE cutoff varies", "WBJEE counselling"),
                new Roadmap.College("Banaras Hindu University", "Affordable public university route for CUET-linked programs.", "Check official fee page", "CUET cutoff varies", "BHU admissions"),
                new Roadmap.College("AIIMS Patna", "Focused public medical option for a NEET student from eastern India.", "Check official fee page", "NEET cutoff varies", "MCC / AIIMS"));
    }

    private List<Roadmap.Scholarship> fallbackScholarships(Profile p) {
        return List.of(
                new Roadmap.Scholarship("Central Sector Scholarship (NSP)", "Up to Rs. 12,000/yr UG", "Expected Oct-Dec 2026", "High Class 12 merit and income criteria", "Built for strong Class 12 students from lower-income homes.", "scholarships.gov.in"),
                new Roadmap.Scholarship("Post Matric Scholarship", "Tuition and maintenance", "Expected Sep-Nov 2026", "Category, income, and domicile rules", "Can reduce fee burden when state rules match.", "scholarships.gov.in"),
                new Roadmap.Scholarship("AICTE Pragati Scholarship", "Up to Rs. 50,000/yr", "Expected Oct-Nov 2026", "Girl students in AICTE-approved technical programs", "Strong fit for a first-generation girl entering technical education.", "aicte-india.org"),
                new Roadmap.Scholarship("Vidyasaarathi Scholarships", "Varies by sponsor", "Rolling", "Marks, income, state, and course rules vary", "Private scholarship backup beyond government aid.", "vidyasaarathi.co.in"),
                new Roadmap.Scholarship("Buddy4Study Scholarships", "Varies by program", "Rolling", "Marks, income, location, and course rules vary", "Find private scholarships matched to course and income.", "buddy4study.com"));
    }

    private String buildSop(Profile p) {
        String name = value(p.name(), "I");
        String first = name.split(" ")[0];
        return name + " did not grow up with college advice at the dinner table, so every form, exam, and deadline had to be learned alone. "
                + value(p.story(), "In " + value(p.location(), "my hometown") + ", " + first + " turned curiosity into a promise that education would change more than one life.")
                + " I want to study for " + value(p.career(), "the career I dream about") + " because my family's first college journey should be the beginning of many more.";
    }

    private List<Roadmap.PlanItem> buildPlan(List<Roadmap.Scholarship> scholarships) {
        String[] tasks = {"Confirm official eligibility, fees, cutoffs, and counselling rules for each shortlisted college.",
                "Prepare income, category, domicile, marksheet, Aadhaar, bank, and first-generation proof documents.",
                "Apply or renew profiles on NSP, Vidyasaarathi, Buddy4Study, and state scholarship portals.",
                "Track JEE/NEET/CUET counselling notices and set a weekly revision or document-check slot.",
                "Finish the SOP, activity list, and one-page family education story.",
                "Submit applications, save receipts, and call admission offices for unclear requirements."};
        List<Roadmap.PlanItem> result = new ArrayList<>();
        for (int i = 0; i < tasks.length; i++) {
            LocalDate date = LocalDate.now().plusMonths(i).withDayOfMonth(1);
            String deadline = i < scholarships.size() ? " Live deadline to watch: " + scholarships.get(i).deadline() + "." : "";
            result.add(new Roadmap.PlanItem(date.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH), tasks[i] + deadline));
        }
        return result;
    }

    private static String value(String value, String fallback) { return value == null || value.isBlank() ? fallback : value; }
    private static String string(JsonObject object, String key, String fallback) { return object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsString() : fallback; }
    private static JsonObject object(JsonObject parent, String key, JsonObject fallback) { return parent.has(key) && parent.get(key).isJsonObject() ? parent.getAsJsonObject(key) : fallback; }
}
