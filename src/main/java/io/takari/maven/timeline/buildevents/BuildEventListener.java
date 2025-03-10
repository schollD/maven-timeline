/**
 * Copyright (C) 2013 david@gageot.net Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.apache.org/licenses/LICENSE-2.0 Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License
 */
package io.takari.maven.timeline.buildevents;

import io.takari.maven.timeline.Event;
import io.takari.maven.timeline.Timeline;
import io.takari.maven.timeline.TimelineSerializer;
import io.takari.maven.timeline.WebUtils;

import java.io.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

import org.apache.maven.execution.AbstractExecutionListener;
import org.apache.maven.execution.ExecutionEvent;
import org.apache.maven.plugin.MojoExecution;
import org.apache.maven.project.MavenProject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// adjacent bars should be a different color
// highlight the critical path
// table with build values that are sortable

public final class BuildEventListener extends AbstractExecutionListener {
    private final Logger logger = LoggerFactory.getLogger(getClass());
    private final File mavenTimeline;
    private final String artifactId;
    private final String groupId;
    private final File output;
    private final long start;
    private final Map<Execution, Metric> executionMetrics = new ConcurrentHashMap<>();
    private final Map<Execution, Event> timelineMetrics = new ConcurrentHashMap<>();
    private final Map<Long, AtomicLong> threadToTrackNum = new ConcurrentHashMap<>();
    private final Map<Long, Integer> threadNumToColour = new ConcurrentHashMap<>();
    private final AtomicLong trackNum = new AtomicLong(0);

    private final long startTime;

    public BuildEventListener(File output, File mavenTimeline, String artifactId, String groupId) {
        this.output = output;
        this.mavenTimeline = mavenTimeline;
        this.artifactId = artifactId;
        this.groupId = groupId;
        this.start = System.currentTimeMillis();
        this.startTime = nowInUtc();
    }

    private long millis() {
        return System.currentTimeMillis() - start;
    }

    @Override
    public void mojoStarted(ExecutionEvent event) {
        Execution key = key(event);
        Long threadId = Thread.currentThread().getId();
        AtomicLong threadTrackNum = threadToTrackNum.get(threadId);
        if (threadTrackNum == null) {
            // use this since we can not computeIfAbsent() yet
            synchronized (this) {
                //noinspection ConstantConditions
                if (threadTrackNum == null) {
                    threadTrackNum = new AtomicLong(trackNum.getAndIncrement());
                    threadToTrackNum.put(threadId, threadTrackNum);
                }
            }
        }
        Integer colour = threadNumToColour.get(threadId);
        if (colour == null) {
            colour = 0;
            threadNumToColour.put(threadId, colour);
        } else {
            colour = 1 - colour;
            threadNumToColour.put(threadId, colour);
        }
        executionMetrics.put(key, new Metric(key, Thread.currentThread().getId(), millis()));
        timelineMetrics.put(
                key,
                new Event(threadTrackNum.get(), nowInUtc(), key.groupId, key.artifactId, key.phase, key.goal, key.id));
    }

    private long nowInUtc() {
        return System.currentTimeMillis();
    }

    @Override
    public void mojoSkipped(ExecutionEvent event) {
        mojoEnd(event);
    }

    @Override
    public void mojoSucceeded(ExecutionEvent event) {
        mojoEnd(event);
    }

    @Override
    public void mojoFailed(ExecutionEvent event) {
        mojoEnd(event);
    }

    private void mojoEnd(ExecutionEvent event) {
        final Event timelineMetric = timelineMetrics.get(key(event));
        final Metric metric = executionMetrics.get(key(event));
        if (metric == null) {
            return;
        }
        metric.setEnd(millis());
        timelineMetric.setEnd(System.currentTimeMillis());
        timelineMetric.setDuration(metric.end - metric.start);
    }

    @Override
    public void sessionEnded(ExecutionEvent event) {
        try {
            Map<String, Set<String>> dependencyData =
                    reportDependencyGraph(event.getSession().getAllProjects());
            report(dependencyData);
        } catch (IOException e) {
            logger.warn("Failed to save timeline metrics", e);
        }
    }

    private Map<String, Set<String>> reportDependencyGraph(List<MavenProject> allProjects) {
        Map<String, Set<String>> graph = new HashMap<>();

        allProjects.forEach(mavenProject -> {
            Set<String> dependencies = new HashSet<>(mavenProject.getDependencies().size());
            mavenProject.getDependencies().forEach(dependency -> {
                dependencies.add(dependency.getGroupId() + ":" + dependency.getArtifactId());
            });

            graph.put(mavenProject.getGroupId() + ":" + mavenProject.getArtifactId(), dependencies);
        });

        return graph;
    }

    private Execution key(ExecutionEvent event) {
        final MojoExecution mojo = event.getMojoExecution();
        final MavenProject project = event.getProject();
        return new Execution(
                project.getGroupId(),
                project.getArtifactId(),
                mojo.getLifecyclePhase(),
                mojo.getGoal(),
                mojo.getExecutionId());
    }

    private void report(Map<String, Set<String>> dependencyData) throws IOException {
        File path = output.getParentFile();
        if (!(path.isDirectory() || path.mkdirs())) {
            throw new IOException("Unable to create " + path);
        }

        try (Writer writer = new BufferedWriter(new FileWriter(output))) {
            Metric.array(writer, executionMetrics.values());
        }

        exportTimeline(dependencyData);
    }

    private void exportTimeline(Map<String, Set<String>> dependencyData) throws IOException {
        long endTime = nowInUtc();
        WebUtils.copyResourcesToDirectory(getClass(), "timeline", mavenTimeline.getParentFile());
        StringWriter mavenTimeLineJs = new StringWriter();

        try (Writer mavenTimelineWriter = new BufferedWriter(mavenTimeLineJs)) {
            Timeline timeline = new Timeline(
                    startTime, endTime, groupId, artifactId, new ArrayList<>(timelineMetrics.values()), dependencyData);
            mavenTimelineWriter.write("window.timelineData = ");
            TimelineSerializer.serialize(mavenTimelineWriter, timeline);
            mavenTimelineWriter.write(";");
        }

        try (Writer mavenTimelineWriter = new BufferedWriter(new FileWriter(mavenTimeline))) {
            mavenTimelineWriter.write(mavenTimeLineJs.toString());
        }

        String appJs = getClassPathResource("app.js");
        String databaseJs = getClassPathResource("database.js");
        String styleCss = getClassPathResource("style.css");
        String timeLineJs = getClassPathResource("timeline.js");

        if(appJs == null || databaseJs == null || styleCss == null || timeLineJs == null) {
            logger.warn("Failed to save timeline standalone");
            return;
        }

        StringBuilder timeLineHtml = new StringBuilder();

        timeLineHtml.append("<html>\n<head>\n\t<title>Maven Timeline</title>\n");

        timeLineHtml
            .append("\t<script>\n\t").append(appJs).append("\n\t//# sourceURL=app.js\n\t</script>\n")
            .append("\t<script>\n\t").append(databaseJs).append("\n\t//# sourceURL=database.js\n\t</script>\n")
            .append("\t<style>\n\t").append(styleCss).append("\n\t//# sourceURL=style.css\n\t</style>\n")
            .append("\t<script>\n\t").append(mavenTimeLineJs).append( "\n\t//# sourceURL=maven-timeline.js\n\t</script>\n")
            .append("\t<script>\n\t").append(timeLineJs).append("\n\t//# sourceURL=timeline.js\n\t</script>\n");

        timeLineHtml.append(
            "</head>\n" +
            "<body onload=\"new TimeLineApp().run();\">\n" +
            "<header>\n" +
            "\t<h1>Time line</h1>\n" +
            "</header>\n" +
            "<main>\n" +
            "\t<div id=\"timeLineContainer\"></div>\n" +
            "</main>\n" +
            "<aside></aside>\n" +
            "</body>\n" +
            "</html>\n");

        File target = new File(mavenTimeline.getParent(), "timeline-standalone.html");
        try (Writer mavenTimelineHtmlWriter = new BufferedWriter(new FileWriter(target))) {
            mavenTimelineHtmlWriter.write(timeLineHtml.toString());
        }

        logger.info("Saved timeline standalone to {}", target.getAbsolutePath());
    }

    private String getClassPathResource(String name) {

        InputStream resourceAsStream = this.getClass().getResourceAsStream("/timeline/" + name);
        if(resourceAsStream == null) {
            return null;
        }

        try(BufferedReader reader = new BufferedReader(new InputStreamReader(resourceAsStream))) {
            return reader.lines().collect(Collectors.joining("\n\t"));
        } catch (IOException e) {
            return null;
        }
    }

    //
    //
    //

    static class Execution {
        final String groupId;
        final String artifactId;
        final String phase;
        final String goal;
        final String id;

        Execution(String groupId, String artifactId, String phase, String goal, String id) {
            this.groupId = groupId;
            this.artifactId = artifactId;
            this.phase = phase;
            this.goal = goal;
            this.id = id;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;

            Execution execution = (Execution) o;

            if (groupId != null ? !groupId.equals(execution.groupId) : execution.groupId != null) return false;
            if (artifactId != null ? !artifactId.equals(execution.artifactId) : execution.artifactId != null)
                return false;
            if (phase != null ? !phase.equals(execution.phase) : execution.phase != null) return false;
            //noinspection SimplifiableIfStatement
            if (goal != null ? !goal.equals(execution.goal) : execution.goal != null) return false;
            return id != null ? id.equals(execution.id) : execution.id == null;
        }

        @Override
        public int hashCode() {
            int result = groupId != null ? groupId.hashCode() : 0;
            result = 31 * result + (artifactId != null ? artifactId.hashCode() : 0);
            result = 31 * result + (phase != null ? phase.hashCode() : 0);
            result = 31 * result + (goal != null ? goal.hashCode() : 0);
            result = 31 * result + (id != null ? id.hashCode() : 0);
            return result;
        }

        @Override
        public String toString() {
            return groupId + ":" + artifactId + ":" + phase + ":" + goal + ":" + id;
        }
    }

    static class Metric {
        final Execution execution;
        final Long threadId;
        final Long start;
        Long end;

        Metric(Execution execution, Long threadId, Long start) {
            this.execution = execution;
            this.threadId = threadId;
            this.start = start;
        }

        void setEnd(Long end) {
            this.end = end;
        }

        String toJSON() {
            return record(
                    value("groupId", execution.groupId),
                    value("artifactId", execution.artifactId),
                    value("phase", execution.phase),
                    value("goal", execution.goal),
                    value("id", execution.id),
                    value("threadId", threadId),
                    value("start", start),
                    value("end", end));
        }

        private String value(String key, String value) {
            return "\"" + key + "\":\"" + value + "\"";
        }

        private String value(String key, Long value) {
            return "\"" + key + "\":" + value + "";
        }

        private String record(String... values) {
            StringBuilder b = new StringBuilder();
            b.append("{");
            for (String value : values) {
                b.append(value).append(",");
            }
            return b.deleteCharAt(b.length() - 1).append("}").toString();
        }

        static void array(Appendable a, Iterable<Metric> metrics) throws IOException {
            a.append("[");
            Iterator<Metric> it = metrics.iterator();
            if (it.hasNext()) {
                a.append(it.next().toJSON());
            }
            while (it.hasNext()) {
                a.append(",").append(it.next().toJSON());
            }
            a.append("]");
        }
    }
}
