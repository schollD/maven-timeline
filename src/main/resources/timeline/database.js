/**
 * Created by Dominik on 10.12.2016.
 */
function TimeLineDb(timelineData) {

  this.getTopPhases = function(limit, renderFunc) {
    // "select phase from events group by phase order by sum(duration) desc LIMIT ?", [limit]
    renderFunc(Object.entries(timelineData.events
      .map(({phase, duration}) => ({phase, duration}))
      .reduce((acc, {phase, duration}) => ({...acc, [phase]: (acc[phase] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([phase]) => ({phase}))
      .slice(0, limit));
  };
  this.getTopGoals = function(limit, renderFunc) {
    // "select goal from events group by goal order by sum(duration) desc LIMIT ?", [limit]
    renderFunc(Object.entries(timelineData.events
      .map(({goal, duration}) => ({goal, duration}))
      .reduce((acc, {goal, duration}) => ({...acc, [goal]: (acc[goal] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([goal]) => ({goal}))
      .slice(0, limit));
  };
  this.getTopArtifacts = function(limit, renderFunc) {
    // "select groupId, artifactId, phase, goal, duration from events order by duration desc limit ?", [limit]
    timelineData.events
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .forEach(e => renderFunc(e.groupId, e.artifactId, e.phase, e.goal, e.duration));
  };
  this.getTotalPhaseDuration = function(renderFunc) {
    // "select phase, sum(duration) from events group by phase order by sum(duration) desc"
    Object.entries(timelineData.events
      .map(({phase, duration}) => ({phase, duration}))
      .reduce((acc, {phase, duration}) => ({...acc, [phase]: (acc[phase] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .forEach(([phase, duration]) => renderFunc(phase, duration));
  };
  this.getTotalGoalDuration = function(renderFunc) {
    // "select goal, sum(duration) from events group by goal order by sum(duration) desc"
    Object.entries(timelineData.events
      .map(({goal, duration}) => ({goal, duration}))
      .reduce((acc, {goal, duration}) => ({...acc, [goal]: (acc[goal] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .forEach(([goal, duration]) => renderFunc(goal, duration));
  };
  this.getTotalArtifactDuration = function(renderFunc) {
    // "select artifactId, sum(duration) from events group by artifactId order by sum(duration) desc"
    Object.entries(timelineData.events
      .map(({artifactId, duration}) => ({artifactId, duration}))
      .reduce((acc, {artifactId, duration}) => ({...acc, [artifactId]: (acc[artifactId] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .forEach(([artifactId, duration]) => renderFunc(artifactId, duration));
  };
  this.getTotalTrackDuration = function(renderFunc) {
    // "select trackNum, sum(duration) from events group by trackNum order by sum(trackNum) desc"
    Object.entries(timelineData.events
      .map(({trackNum, duration}) => ({trackNum, duration}))
      .reduce((acc, {trackNum, duration}) => ({...acc, [trackNum]: (acc[trackNum] || 0) + duration}), {}))
      .sort((a, b) => b[1] - a[1])
      .forEach(([trackNum, duration]) => renderFunc(trackNum, duration));
  };

  this.costData = new Map();
  this.forwardsPathCache = new Map();
  this.backwardsPathCache = new Map();
  timelineData.events.forEach((event) => {
    const key = event.groupId + ":" + event.artifactId;
    if(!this.costData.has(key)) {
      this.costData.set(key, event.duration);
    }
    else {
      this.costData.set(key, this.costData.get(key) + event.duration);
    }
  });

  timelineData.projectDependencies = {};
  Object.keys(timelineData.dependencies).forEach( (dependency) => {
    const projectDeps = [];
    timelineData.dependencies[dependency].forEach( (entry) => {
      if(this.costData.has(entry)) {
        projectDeps.push(entry);
      }
    });
    timelineData.projectDependencies[dependency] = projectDeps;
  });


  timelineData.reverseDependencies = [];
  Object.keys(timelineData.projectDependencies).forEach(dependency => {
    let reverseDeps = [];
    Object.keys(timelineData.projectDependencies).forEach((current) => {
      if(timelineData.projectDependencies[current].indexOf(dependency) !== -1) {
        reverseDeps.push(current)
      }
    });
    timelineData.reverseDependencies[dependency] = reverseDeps;
  });

  this.getLongestPathToStart = function(groupId, artifactId) {
    return this.getLongestPath(groupId, artifactId, timelineData.projectDependencies, this.getLongestPathToStart, this.backwardsPathCache);
  }

  this.getLongestPathToEnd = function(groupId, artifactId) {
    return this.getLongestPath(groupId, artifactId, timelineData.reverseDependencies, this.getLongestPathToEnd, this.forwardsPathCache);
  }

  this.getLongestPath = function(groupId, artifactId, dependencies, stepFunc, cache) {
    let key = groupId + ":" + artifactId;
    if(cache.has(key)) {
      return cache.get(key);
    }
    let directDependencies = dependencies[key];

    let self = {
      cost: this.costData.get(key),
      groupId: groupId,
      artifactId: artifactId,
      path: []
    }

    let paths = [];

    if(directDependencies && directDependencies.length > 0) {

      for (const directDependency of directDependencies) {
        if(!this.costData.has(directDependency)) continue;
        let split = directDependency.split(":");
        let path = stepFunc.call(this, split[0], split[1]);
        paths.push(path);
      }

      if(paths.length > 0) {
        paths.sort( (p1, p2) => {
          if(p1.cost < p2.cost) return -1;
          if(p1.cost > p2.cost) return 1;
          return 0;
        });
        let last = paths[paths.length-1];
        if(last.cost !== 0 || last.path.length !== 0) {
          self.cost += last.cost;
          self.path = last.path.map((x) => x);
          self.path.push({groupId: last.groupId, artifactId: last.artifactId})
        }
      }
    }

    cache.set(key, {
      cost: self.cost,
      groupId: self.groupId,
      artifactId: self.artifactId,
      path: self.path.map((x) => x)
    });

    return self;
  };
}
