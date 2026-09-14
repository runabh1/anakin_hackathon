package com.firstgennavigator;

import java.util.LinkedHashMap;
import java.util.Map;

public record Profile(
        String name, String grade, String marks, String stream, String location,
        String income, String category, String gender, String exams, String examYear,
        String jee, String neet, String attempt, String board, String career,
        String interests, String preferredLocation, String budget, String story) {

    public Map<String, String> asMap() {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("name", name); values.put("grade", grade); values.put("marks", marks);
        values.put("stream", stream); values.put("location", location); values.put("income", income);
        values.put("category", category); values.put("gender", gender); values.put("exams", exams);
        values.put("examYear", examYear); values.put("jee", jee); values.put("neet", neet);
        values.put("attempt", attempt); values.put("board", board); values.put("career", career);
        values.put("interests", interests); values.put("preferredLocation", preferredLocation);
        values.put("budget", budget); values.put("story", story);
        return values;
    }

    public static Profile demo() {
        return new Profile("Asha Kumar", "Class 12", "86%", "PCM with Computer Science",
                "Ranchi, Jharkhand", "Rs. 1.8 lakh", "OBC", "Female", "JEE Main, CUET",
                "2026", "92 percentile", "", "First attempt", "CBSE", "software engineer",
                "coding, robotics, helping younger students", "Jharkhand, West Bengal, Delhi NCR",
                "Under Rs. 1 lakh per year",
                "My parents never went to college. I want to be the first engineer in my family.");
    }
}
