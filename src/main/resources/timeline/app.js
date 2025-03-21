var HIGHLIGHTED_ITEMS = 10;

window.highlightColorTheme = [
  "#ef5350",
  "#ba68c8",
  "#7986cb",
  "#4fc3f7",
  "#81c784",
  "#d4e157",
  "#fff176",
  "#f48fb1",
  "#827717",
  "#a1887f",
  "#90a4ae",
  "#ff5722",
  "#ffc107"
];

function TimeLineApp() {
  var timelineData = window.timelineData;
  if (timelineData == undefined) {
    $.ajax({
      url: "maven-timeline.json",
      dataType: "json",
      async: false
    }).done(function (data) {
      timelineData = data
    });
  }
  this.timeLineDb = new TimeLineDb(timelineData);
  this.timeLine = new TimeLine(timelineData);

  function elem(tagName, content) {
    var element = document.createElement(tagName);
    element.innerText = content;
    return element;
  }

  function addStatsCards(timeLineDb) {
    var cardTitles = ["Summary by phase", "Summary by goal", "Summary by artifact", "Summary by track"];

    for (var i = 0; i < cardTitles.length; i++) {
      var summary = document.createElement("div");
      summary.setAttribute("class", "summary card");
      var h2 = document.createElement("h2");
      h2.innerText = cardTitles[i];
      summary.appendChild(h2);
      document.getElementsByTagName("aside")[0].appendChild(summary);
    }

    timeLineDb.getTotalPhaseDuration(function (phase, duration) {
      var container = document.createElement("div");
      container.appendChild(elem("span", phase));
      container.appendChild(elem("span", formatTime(duration)));
      document.getElementsByClassName("summary")[0].appendChild(container);
    });
    timeLineDb.getTotalGoalDuration(function (goal, duration) {
      var container = document.createElement("div");
      container.appendChild(elem("span", goal));
      container.appendChild(elem("span", formatTime(duration)));
      document.getElementsByClassName("summary")[1].appendChild(container);
    });
    timeLineDb.getTotalArtifactDuration(function (artId, duration) {
      var container = document.createElement("div");
      container.appendChild(elem("span", artId));
      container.appendChild(elem("span", formatTime(duration)));
      document.getElementsByClassName("summary")[2].appendChild(container);
    });
    timeLineDb.getTotalTrackDuration(function (track, duration) {
      var container = document.createElement("div");
      container.appendChild(elem("span", track));
      container.appendChild(elem("span", formatTime(duration)));
      document.getElementsByClassName("summary")[3].appendChild(container);
    });
  }

  function addControls(zoomMin, zoomMax, zoomDefault, timeLineDb, timeLine) {
    var controlsContainer = document.createElement("div");
    controlsContainer.setAttribute("class", "controls card");
    var h2 = document.createElement("h2");
    h2.innerText = "Controls";
    controlsContainer.appendChild(h2);
    document.getElementsByTagName("aside")[0].appendChild(controlsContainer);

    if(window.$) {
        var sliderContainer = document.createElement("div");
        var slider = document.createElement("div");
        slider.setAttribute("id", "zoomSlider");
        sliderContainer.appendChild(elem("span", "Zoom"));
        sliderContainer.appendChild(slider);

        var legendElement = document.createElement("legend");
        legendElement.innerText = "Show/Hide labels";
        controlsContainer.appendChild(sliderContainer);
        controlsContainer.appendChild(legendElement);
        $(function () {
          $("#zoomSlider").slider({
            min: zoomMin, max: zoomMax, step: 1, value: zoomDefault,
            change: function (ev, ui) {
              timeLine.render(ui.value);
            }
          });
        });
    }
    else {
        var sliderContainer = document.createElement("div");
        var slider = document.createElement("input");
        slider.setAttribute("type", "number");
        slider.setAttribute("min", "1");
        slider.setAttribute("max", "100");
        slider.setAttribute("step", "5");
        slider.setAttribute("value", Math.round(zoomMax / zoomDefault));
        slider.setAttribute("id", "zoomSlider");
        slider.addEventListener("change", (e) => {
          timeLine.render( (e.target.value * zoomMax) / 100);
        })
        sliderContainer.appendChild(elem("span", "Zoom"));
        sliderContainer.appendChild(slider);

        var legendElement = document.createElement("legend");
        legendElement.innerText = "Show/Hide labels";
        controlsContainer.appendChild(sliderContainer);
        controlsContainer.appendChild(legendElement);
    }

    appendCssClassToggle(controlsContainer, "groupId", true);
    appendCssClassToggle(controlsContainer, "artifactId", true);
    appendCssClassToggle(controlsContainer, "phase", true);
    appendCssClassToggle(controlsContainer, "goal", true);
    appendCssClassToggle(controlsContainer, "id", true);
    appendCssClassToggle(controlsContainer, "duration", true);

    legendElement = document.createElement("legend");
    legendElement.innerText = "Highlight by phase";
    controlsContainer.appendChild(legendElement);

    timeLineDb.getTopPhases(HIGHLIGHTED_ITEMS, function(rows) {
      var themeIndex = 0;
      for(var i = 0; i < rows.length; i++, themeIndex++) {
        if(themeIndex >= (window.highlightColorTheme.length)) {
          themeIndex = 0;
        }
        appendHighlightToggle(controlsContainer, "phase-", rows[i]["phase"], themeIndex);
      }

      legendElement = document.createElement("legend");
      legendElement.innerText = "Highlight by goal";
      controlsContainer.appendChild(legendElement);

      timeLineDb.getTopGoals(HIGHLIGHTED_ITEMS, function(rows) {
        var themeIndex = 0;
        for(var i = 0; i < rows.length; i++, themeIndex++) {
          if(themeIndex >= (window.highlightColorTheme.length)) {
             themeIndex = 0;
          }
          appendHighlightToggle(controlsContainer, "goal-", rows[i]["goal"], window.highlightColorTheme.length - 1 - themeIndex);
        }
      });
    });
  }

  function appendCssClassToggle(controlsContainer, className, enabled) {
    var label = document.createElement("label");
    var input = document.createElement("input");
    var name = "checkbox-nested-" + className;

    input.setAttribute("type", "checkbox");
    input.setAttribute("name", name);
    input.setAttribute("id", name);
    input.setAttribute("data-title", className);
    label.setAttribute("for", name);

    if(enabled != undefined && enabled != false) {
      input.setAttribute("checked", true);
    }
    //else {
    //  document.styleSheets[0].addRule("." + className, "display: none;");
    //}

    label.innerText = className;
    label.appendChild(input);
    controlsContainer.appendChild(label);

    document.querySelector("#" + name).addEventListener("change", (e) => {
      var attribute = e.target.getAttribute("data-title");

      if (e.target.checked == true) {
        document.querySelectorAll("." + attribute).forEach((e) => e.style.display = "initial")
        e.target.setAttribute("checked", "true");
      }
      else {
        document.querySelectorAll("." + attribute).forEach((e) => e.style.display = "none")
        e.target.setAttribute("checked", "false");
      }
    });
  }

  function appendHighlightToggle(controlsContainer, classPrefix, className, index) {
    var label = document.createElement("label");
    var input = document.createElement("input");
    var name = "checkbox-nested-" + classPrefix + className;

    input.setAttribute("type", "checkbox");
    input.setAttribute("name", name);
    input.setAttribute("id", name);
    input.setAttribute("data-title", classPrefix+className);
    input.setAttribute("data-index", index);
    label.setAttribute("for", name);
    label.setAttribute("class", "highlightingBox");
    label.setAttribute("style", "background-color: " + window.highlightColorTheme[index] + "; border-color: " + window.highlightColorTheme[index]);

    label.innerText = className;
    label.appendChild(input);
    controlsContainer.appendChild(label);

    //document.styleSheets[0].addRule(".event" + "." + classPrefix+className + ":hover",
    //  "background-color: " + window.highlightColorTheme[index] + "; transition: background-color .5s;"
    //);

    document.querySelector("#" + name).addEventListener("change", (e) => {
      var attribute = e.target.getAttribute("data-title");
      var index = e.target.getAttribute("data-index");
      var checked = e.target.getAttribute("checked");

      if(checked === "true") {
        e.target.setAttribute("checked", "false");
      }
      else {
        e.target.setAttribute("checked", "true");
      }

      var sheet = document.styleSheets[attribute];
      if(sheet == undefined) {
        document.styleSheets[attribute] = (function() {
          var style = document.createElement("style");
          style.appendChild(document.createTextNode(""));
          document.head.appendChild(style);
          return style.sheet;
        })();
        sheet = document.styleSheets[attribute];
      }
      if (e.target.checked == true) {
        sheet.addRule("." + attribute + ".event", "background-color: " + window.highlightColorTheme[index] + " !important");
      }
      else {
        sheet.removeRule(0);
      }
    });
  }

  function addRankings(timeLineDb) {
    var controlsContainer = document.createElement("div");
    controlsContainer.setAttribute("class", "ranking card");
    var h2 = document.createElement("h2");
    h2.innerText = "Top 10 artifacts";
    controlsContainer.appendChild(h2);
    document.getElementsByTagName("aside")[0].appendChild(controlsContainer);

    timeLineDb.getTopArtifacts(10, function (groupId, artId, phase, goal, duration) {
      var container = document.createElement("div");
      container.appendChild(elem("span", artId + ":" + phase + ":" + goal));
      container.appendChild(elem("span", formatTime(duration)));
      document.getElementsByClassName("ranking")[0].appendChild(container);
    });
  }

  function addDependencyCard(timeLine, timeLineDb) {
    var controlsContainer = document.createElement("div");
    const depsDiv = document.createElement("div");
    const style = document.createElement("style");
    controlsContainer.setAttribute("class", "dependency card");
    var h2 = document.createElement("h2");
    h2.innerText = "Build dependencies";
    controlsContainer.appendChild(h2);
    controlsContainer.appendChild(depsDiv);
    document.getElementsByTagName("aside")[0].appendChild(controlsContainer);

    timeLine.onEventClicked = function(timeLineEvent) {
        if(!timeLineEvent) {
            depsDiv.innerHTML = "No selection";
            return;
        }
        let styleText = "";
        const key = timeLineEvent.groupId + ":" + timeLineEvent.artifactId;
        const predecessors = timelineData.dependencies[key].filter((v,i,arr) => timelineData.dependencies[v]); // filter out third parties
        var hSuccessors = document.createElement("h3");
        hSuccessors.innerText = "Successors";
        var hPredecessors = document.createElement("h3");
        hPredecessors.innerText = "Predecessors";
        var selectionText = key + "<br/>Start:&nbsp;" + new Date(timeLineEvent.start).toISOString() + "<br/>End:&nbsp;&nbsp;" + new Date(timeLineEvent.end).toISOString();
        selectionText += "<br/>Duration: " + formatTime(timeLineEvent.duration);
        depsDiv.innerHTML = "Selection: " +selectionText;
        depsDiv.appendChild(hPredecessors);
        let list = document.createElement("ul");
        for(var pre of predecessors) {
            var li = document.createElement("li");
            li.innerText = pre;
            list.appendChild(li);
        }
        if(predecessors.length > 0) {
            depsDiv.appendChild(list);
            let classList1 = predecessors
                .map((v, i, arr) => ".groupId-" + v.split(':')[0].replaceAll(".","-") + ".artifactId-" + v.split(':')[1])
                .join(",\n");
            styleText += "/* Direct predecessors */\n";
            styleText += classList1 + " {\n\tbackground-color: " + window.highlightColorTheme[window.highlightColorTheme.length-1] + " !important;\n}\n";
        }
        else {
            depsDiv.appendChild(document.createTextNode("None"))
        }
        depsDiv.appendChild(hSuccessors);
        list = document.createElement("ul");
        const successors = [];
        for(var candidate of Object.keys(timelineData.dependencies)) {
            if(timelineData.dependencies[candidate].indexOf(key) >= 0) {
                successors.push(candidate);
            }
        }
        for(var suc of successors) {
            var li = document.createElement("li");
            li.innerText = suc;
            list.appendChild(li);
        }
        if(successors.length > 0) {
            depsDiv.appendChild(list);
            let classList2 = successors
                .map((v, i, arr) => ".groupId-" + v.split(':')[0].replaceAll(".","-") + ".artifactId-" + v.split(':')[1])
                .join(",\n");
            styleText += "/* Direct successors */\n";
            styleText += classList2 + " {\n\tbackground-color: " + window.highlightColorTheme[window.highlightColorTheme.length-2] + " !important;\n}\n";
        }
        else {
            depsDiv.appendChild(document.createTextNode("None"))
        }

        let startPath = timeLineDb.getLongestPathToStart(timeLineEvent.groupId, timeLineEvent.artifactId);
        let endPath = timeLineDb.getLongestPathToEnd(timeLineEvent.groupId, timeLineEvent.artifactId);
        endPath.path.reverse();

        if(startPath.path.length > 0) {
          hSuccessors = document.createElement("h3");
          hSuccessors.innerText = "Longest path to start (" + formatTime(startPath.cost) + ")";
          depsDiv.appendChild(hSuccessors);
          list = document.createElement("ol");
          styleText += "/* Indirect predecessors */\n";
          for (var startElement of startPath.path) {
            var li = document.createElement("li");
            li.innerText = startElement.groupId + ":" + startElement.artifactId;
            list.appendChild(li);

            styleText += ".groupId-" + startElement.groupId.replaceAll(".","-") + ".artifactId-" + startElement.artifactId +
              " {\n\tbackground-color: " + window.highlightColorTheme[window.highlightColorTheme.length-4] + ";\n}\n";
          }
          depsDiv.appendChild(list);
        }

        if(endPath.path.length > 0) {
          hPredecessors = document.createElement("h3");
          hPredecessors.innerText = "Longest path to end (" + formatTime(endPath.cost) + ")";
          depsDiv.appendChild(hPredecessors);
          list = document.createElement("ol");
          styleText += "/* Indirect successors */\n";
          for (var endElement of endPath.path) {
            var li = document.createElement("li");
            li.innerText = endElement.groupId + ":" + endElement.artifactId;
            list.appendChild(li);

            styleText += ".groupId-" + endElement.groupId.replaceAll(".","-") + ".artifactId-" + endElement.artifactId +
              " {\n\tbackground-color: " + window.highlightColorTheme[window.highlightColorTheme.length-4] + ";\n}\n";
          }
          depsDiv.appendChild(list);
        }

        styleText += "/* Self */\n";
        styleText += ".groupId-" + timeLineEvent.groupId.replaceAll(".","-") + ".artifactId-" + timeLineEvent.artifactId +
        " {\n\tbackground-color: " + window.highlightColorTheme[window.highlightColorTheme.length-3] + ";\n}\n";

        style.innerHTML = styleText;
        depsDiv.appendChild(style);
    }

    timeLine.onEventClicked();
  }

  this.run = function() {
    var zoomMin = 1;
    var zoomMax = Math.max(zoomMin, (timelineData.end - timelineData.start) / 1000);
    var zoomDefault = Math.max(zoomMin, zoomMax / 3);

    this.timeLine.render(zoomDefault);

    addControls(zoomMin, zoomMax, zoomDefault, this.timeLineDb, this.timeLine);
    addDependencyCard(this.timeLine, this.timeLineDb);
    addStatsCards(this.timeLineDb);
    addRankings(this.timeLineDb);
  }
}

function formatTime(duration) {
  if(duration < 100) {
    return duration + " ms";
  }
  if(duration < 1000 * 60) {
    return Number((duration/1000).toFixed(1)) + " s";
  }
  // if(duration < 1000 * 60 * 60) {
    return Math.floor(duration / (1000 * 60)) + " min " + Math.floor(((duration % (60 * 1000)) / 1000)) + " s";
  // }
}
