package com.firstgennavigator;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.print.PrinterJob;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.stage.Stage;

import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public final class App extends Application {
    private final NavigatorService service = new NavigatorService();
    private final List<TextField> fields = new ArrayList<>();
    private final Properties progress = new Properties();
    private final Path progressFile = Path.of(System.getProperty("user.home"), ".first-gen-navigator.properties");
    private VBox results;
    private Label status;
    private Button buildButton;
    private String currentSop = "";

    @Override public void start(Stage stage) {
        loadProgress();
        BorderPane root = new BorderPane();
        root.setStyle("-fx-background-color: #07111f; -fx-font-family: 'Segoe UI';");
        root.setTop(hero());
        root.setCenter(content());
        Scene scene = new Scene(root, 1280, 820);
        stage.setTitle("First Gen Navigator");
        stage.setScene(scene);
        stage.show();
    }

    private Node hero() {
        VBox box = new VBox(8);
        box.setAlignment(Pos.CENTER);
        box.setPadding(new Insets(30, 20, 24, 20));
        Label brand = label("1G  FIRST GEN NAVIGATOR", 14, "#5eead4");
        Label title = label("Your college roadmap. Built by AI. Made for you.", 30, "#f8fafc");
        title.setStyle("-fx-font-weight: 800; -fx-text-alignment: center;");
        Label subtitle = label("Live scholarship research, affordable college matches, and a clear next step for first-generation students.", 13, "#94a3b8");
        box.getChildren().addAll(brand, title, subtitle);
        return box;
    }

    private Node content() {
        HBox layout = new HBox(18, formPanel(), resultPanel());
        layout.setPadding(new Insets(0, 24, 24, 24));
        HBox.setHgrow(layout.getChildren().get(1), Priority.ALWAYS);
        return layout;
    }

    private Node formPanel() {
        VBox panel = panel();
        panel.setPrefWidth(500);
        Label heading = label("Tell us about yourself", 20, "#f8fafc");
        Label hint = label("Build a personalized roadmap in under 90 seconds.", 12, "#94a3b8");
        GridPane grid = new GridPane();
        grid.setHgap(10); grid.setVgap(10);
        String[] names = {"Full name", "Class / grade", "Marks", "Stream / subjects", "State / city", "Annual family income", "Category", "Gender", "Entrance exams", "Exam year", "JEE percentile / marks", "NEET marks", "Dream career", "Interests / hobbies", "Preferred college location", "Annual college budget", "First-generation story"};
        for (int i = 0; i < names.length; i++) {
            Label fieldLabel = label(names[i], 11, "#cbd5e1");
            TextField field = new TextField();
            field.setPromptText(names[i]);
            field.setPrefHeight(34);
            fields.add(field);
            int col = (i == 16) ? 0 : i % 2;
            int row = (i == 16) ? 8 : i / 2;
            if (i == 16) GridPane.setColumnSpan(field, 2);
            grid.add(new VBox(3, fieldLabel, field), col, row);
        }
        Button demo = new Button("Load demo profile");
        demo.setOnAction(e -> fillDemo());
        buildButton = new Button("Build my roadmap");
        buildButton.setDefaultButton(true);
        buildButton.setOnAction(e -> buildRoadmap());
        HBox actions = new HBox(10, demo, buildButton);
        actions.setAlignment(Pos.CENTER_RIGHT);
        panel.getChildren().addAll(heading, hint, new Separator(), grid, actions);
        return panel;
    }

    private Node resultPanel() {
        VBox panel = panel();
        HBox statusBar = new HBox(8);
        statusBar.setAlignment(Pos.CENTER_LEFT);
        status = label("Ready - enter your profile and build your roadmap.", 13, "#fbbf24");
        Button copy = new Button("Copy SOP");
        copy.setOnAction(e -> copySop());
        Button print = new Button("Print");
        print.setOnAction(e -> printResults());
        Button share = new Button("Share");
        share.setOnAction(e -> shareResults());
        statusBar.getChildren().addAll(status, new Region(), copy, print, share);
        HBox.setHgrow(statusBar.getChildren().get(1), Priority.ALWAYS);
        results = new VBox(10, label("Your roadmap will appear here.", 18, "#f8fafc"), label("Use Load demo profile to explore the complete workflow.", 13, "#94a3b8"));
        ScrollPane scroll = new ScrollPane(results);
        scroll.setFitToWidth(true);
        scroll.setStyle("-fx-background: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(scroll, Priority.ALWAYS);
        panel.getChildren().addAll(statusBar, scroll);
        return panel;
    }

    private void buildRoadmap() {
        if (fields.size() < 17 || fields.get(0).getText().isBlank() || fields.get(1).getText().isBlank() || fields.get(2).getText().isBlank() || fields.get(3).getText().isBlank() || fields.get(4).getText().isBlank() || fields.get(5).getText().isBlank() || fields.get(12).getText().isBlank()) {
            status.setText("Please fill the required profile fields first.");
            status.setTextFill(Color.web("#fb7185"));
            return;
        }
        Profile profile = profileFromFields();
        buildButton.setDisable(true);
        status.setText("Searching live scholarship and college data...");
        status.setTextFill(Color.web("#fbbf24"));
        Task<Roadmap> task = new Task<>() { @Override protected Roadmap call() { return service.build(profile); } };
        task.setOnSucceeded(e -> { render(task.getValue()); buildButton.setDisable(false); });
        task.setOnFailed(e -> { status.setText("Could not build roadmap: " + task.getException().getMessage()); buildButton.setDisable(false); });
        Thread worker = new Thread(task, "roadmap-builder");
        worker.setDaemon(true); worker.start();
    }

    private Profile profileFromFields() {
        String[] v = fields.stream().map(TextInputControl::getText).toArray(String[]::new);
        return new Profile(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11], "First attempt", "", v[12], v[13], v[14], v[15], v[16]);
    }

    private void render(Roadmap roadmap) {
        Platform.runLater(() -> {
            status.setText(roadmap.live() ? "Live AI data from Anakin" : roadmap.sourceSummary());
            status.setTextFill(Color.web(roadmap.live() ? "#5eead4" : "#fbbf24"));
            currentSop = roadmap.sop();
            TabPane tabs = new TabPane();
            tabs.getTabs().add(new Tab("Colleges", cards(roadmap.colleges().stream().map(c -> c.name() + "\n" + c.reason() + "\nFees: " + c.fees() + " | Cutoff: " + c.cutoff() + "\nSource: " + c.source()).toList(), "college")));
            tabs.getTabs().add(new Tab("Scholarships", scholarshipCards(roadmap.scholarships())));
            tabs.getTabs().add(new Tab("Action plan", cards(roadmap.plan().stream().map(p -> p.month() + " - " + p.task()).toList(), "plan")));
            TextArea sop = new TextArea(roadmap.sop()); sop.setWrapText(true); sop.setPrefRowCount(8);
            tabs.getTabs().add(new Tab("SOP opening", sop));
            results.getChildren().setAll(label("Roadmap for " + roadmap.profile().name(), 20, "#f8fafc"), tabs);
        });
    }

    private VBox cards(List<String> items, String key) {
        VBox box = new VBox(10);
        for (int i = 0; i < items.size(); i++) {
            int index = i;
            CheckBox done = new CheckBox(items.get(i));
            done.setWrapText(true); done.setMaxWidth(Double.MAX_VALUE); done.setPadding(new Insets(12));
            done.setSelected(Boolean.parseBoolean(progress.getProperty(key + index, "false")));
            done.setOnAction(e -> { progress.setProperty(key + index, Boolean.toString(done.isSelected())); saveProgress(); });
            box.getChildren().add(done);
        }
        return box;
    }

    private VBox scholarshipCards(List<Roadmap.Scholarship> items) {
        VBox box = new VBox(10);
        for (int i = 0; i < items.size(); i++) {
            int index = i;
            Roadmap.Scholarship s = items.get(i);
            CheckBox applied = new CheckBox("Applied");
            applied.setSelected(Boolean.parseBoolean(progress.getProperty("scholarship" + index, "false")));
            applied.setOnAction(e -> { progress.setProperty("scholarship" + index, Boolean.toString(applied.isSelected())); saveProgress(); });
            Label text = label(s.name() + "\n" + s.amount() + " | Deadline: " + s.deadline() + "\n" + s.eligibility() + "\n" + s.why() + "\nSource: " + s.source(), 13, "#cbd5e1");
            text.setWrapText(true);
            HBox row = new HBox(12, text, applied); row.setAlignment(Pos.TOP_LEFT); HBox.setHgrow(text, Priority.ALWAYS);
            row.setPadding(new Insets(12)); box.getChildren().add(row);
        }
        return box;
    }

    private void fillDemo() {
        Profile p = Profile.demo();
        String[] values = {p.name(), p.grade(), p.marks(), p.stream(), p.location(), p.income(), p.category(), p.gender(), p.exams(), p.examYear(), p.jee(), p.neet(), p.career(), p.interests(), p.preferredLocation(), p.budget(), p.story()};
        for (int i = 0; i < values.length; i++) fields.get(i).setText(values[i]);
        status.setText("Demo profile loaded - build the roadmap when ready.");
    }

    private void copySop() { javafx.scene.input.ClipboardContent content = new javafx.scene.input.ClipboardContent(); content.putString(currentSop); javafx.scene.input.Clipboard.getSystemClipboard().setContent(content); status.setText("SOP copied to clipboard."); }
    private void shareResults() { javafx.scene.input.ClipboardContent content = new javafx.scene.input.ClipboardContent(); content.putString("My First Gen Navigator roadmap is ready."); javafx.scene.input.Clipboard.getSystemClipboard().setContent(content); status.setText("Share text copied to clipboard."); }
    private void printResults() { PrinterJob job = PrinterJob.createPrinterJob(); if (job != null && job.showPrintDialog(results.getScene().getWindow())) { job.printPage(results); job.endJob(); } }
    private VBox panel() { VBox box = new VBox(14); box.setPadding(new Insets(20)); box.setStyle("-fx-background-color: #0f1c2e; -fx-background-radius: 14; -fx-border-color: #21344d; -fx-border-radius: 14;"); return box; }
    private Label label(String text, double size, String color) { Label l = new Label(text); l.setFont(Font.font("Segoe UI", size)); l.setTextFill(Color.web(color)); return l; }
    private void loadProgress() { try { if (Files.exists(progressFile)) try (var reader = Files.newBufferedReader(progressFile)) { progress.load(reader); } } catch (Exception ignored) {} }
    private void saveProgress() { try (var writer = Files.newBufferedWriter(progressFile, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) { progress.store(writer, "First Gen Navigator progress"); } catch (Exception ignored) {} }
    public static void main(String[] args) { launch(args); }
}
