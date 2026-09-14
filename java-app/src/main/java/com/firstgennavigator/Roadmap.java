package com.firstgennavigator;

import java.util.List;

public record Roadmap(Profile profile, List<College> colleges, List<Scholarship> scholarships,
                      String sop, List<PlanItem> plan, boolean live, String sourceSummary) {
    public record College(String name, String reason, String fees, String cutoff, String source) {}
    public record Scholarship(String name, String amount, String deadline, String eligibility,
                              String why, String source) {}
    public record PlanItem(String month, String task) {}
}
