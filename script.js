const store = {};
var spaceType = "Tout";
var neighborhoods = {};
var streets = {};
var spaces = {};
var projection;
var pathGenerator;
var neighborhoodMap;
var miniProjection;
var miniPathGenerator;
var miniMap;
var clicked = [];
var neighborhoodInData;
var isMiniMapOpen = false;
function loadData() {
  return Promise.all([
    d3.json("limites-administratives-agglomeration.json"),
    d3.json("espace_vert.json"),
    d3.json("geobase.json"),
  ]).then((datasets) => {
    store.neighborhoods = datasets[0];
    store.spaces = datasets[1];
    store.streets = datasets[2];
    return store;
  });
}

const MAP_WIDTH = parseFloat(d3.select("#map").style("width"));
const MAP_HEIGHT = parseFloat(d3.select("#map").style("height"));

const MINIMAP_WIDTH = parseFloat(d3.select("#minimap").style("width")) - 4;
const MINIMAP_HEIGHT = parseFloat(d3.select("#minimap").style("height")) - 4;

var zoom = d3
  .zoom()
  .scaleExtent([1, 5])
  .translateExtent([
    [0, 0],
    [MINIMAP_WIDTH, MINIMAP_HEIGHT],
  ])
  .on("zoom", handleZoom);

function handleZoom(e) {
  d3.selectAll("#minimap path").attr("transform", e.transform);
}

const colorScale = d3
  .scaleOrdinal()
  .domain([
    "Parc d'arrondissement",
    "Grand parc",
    "Espace voirie",
    "Autre espace vert",
  ])
  .range(["#729125", "#3a6712", "#023e00", "#aaba37"]);

function loadSpaces() {
  if (spaceType != "Tout") {
    spaces = store.spaces.features.filter(
      (d) => d.properties.TYPO1 === spaceType
    );
  } else {
    spaces = store.spaces.features;
  }
  var mergedSpaces = [];
  var groupedSpaces = d3.group(
    spaces,
    (s) => s.properties.Type,
    (s) => s.properties.Nom
  );
  for (const g of groupedSpaces) {
    for (const s of g[1]) {
      if (g[0] == null || s[1].length == 1) {
        mergedSpaces.push(turf.rewind(s[1][0], { reverse: true }));
      } else if (s[1].length == 2) {
        var union = turf.union(turf.featureCollection([s[1][0], s[1][1]]));
        union.properties = {
          Type: s[1][0].properties.Type,
          Nom: s[1][0].properties.Nom,
          Lien: s[1][0].properties.Lien,
          TYPO1: s[1][0].properties.TYPO1,
          TYPTO2: s[1][0].properties.TYPO2,
          SUPERFICIE:
            parseFloat(s[1][0].properties.SUPERFICIE) +
            parseFloat(s[1][1].properties.SUPERFICIE),
        };
        mergedSpaces.push(turf.rewind(union, { reverse: true }));
      } else {
        var unions = [];
        var superficie = 0;
        for (let u = 0; u < s[1].length; u += 2) {
          if (u + 1 >= s[1].length) {
            superficie += parseFloat(s[1][u].properties.SUPERFICIE);
            unions.push(s[1][u]);
          } else {
            superficie +=
              parseFloat(s[1][u].properties.SUPERFICIE) +
              parseFloat(s[1][u + 1].properties.SUPERFICIE);
            unions.push(
              turf.union(turf.featureCollection([s[1][u], s[1][u + 1]]))
            );
          }
        }
        var union = unions[0];
        for (let u = 1; u < unions.length; u++) {
          union = turf.union(turf.featureCollection([union, unions[u]]));
        }
        union.properties = {
          Type: s[1][0].properties.Type,
          Nom: s[1][0].properties.Nom,
          Lien: s[1][0].properties.Lien,
          TYPO1: s[1][0].properties.TYPO1,
          TYPTO2: s[1][0].properties.TYPO2,
          SUPERFICIE: superficie,
        };
        if (union.properties.Nom === "Grand parc de l'Ouest") {
          var edge = turf.union(
            turf.featureCollection(
              store.neighborhoods.features.filter(
                (d) =>
                  d.properties.NOM == "Pierrefonds-Roxboro" ||
                  d.properties.NOM == "L'Île-Bizard-Sainte-Geneviève"
              )
            )
          );
          union.geometry = turf.intersect(
            turf.featureCollection([union, edge])
          ).geometry;
        }
        if (union.properties.Nom === "Bois-d'Anjou") {
          var edge = store.neighborhoods.features.filter(
            (d) => d.properties.NOM == "Anjou"
          );
          union.geometry = turf.intersect(
            turf.featureCollection([union, edge[0]])
          ).geometry;
        }
        if (union.properties.Nom === "Bois-de-Liesse") {
          var edge = turf.union(
            turf.featureCollection(
              store.neighborhoods.features.filter(
                (d) =>
                  d.properties.NOM == "Pierrefonds-Roxboro" ||
                  d.properties.NOM == "Saint-Laurent"
              )
            )
          );
          union.geometry = turf.intersect(
            turf.featureCollection([union, edge])
          ).geometry;
        }
        mergedSpaces.push(turf.rewind(union, { reverse: true }));
      }
    }
  }
  spaces = mergedSpaces;
}

function createMap() {
  const filteredNeighborhoods = store.neighborhoods.features.filter(
    (d) => d.properties.TYPE == "Arrondissement"
  );
  neighborhoods = filteredNeighborhoods.map((d) => {
    return turf.rewind(d, { reverse: true });
  });

  const filteredStreets = store.streets.features.filter(
    (d) => d.properties.LIM_GCH == "Montréal"
  );
  streets = filteredStreets.map((d) => {
    return turf.rewind(d, { reverse: true });
  });

  projection = d3
    .geoMercator()
    .center(turf.center(store.neighborhoods).geometry.coordinates)
    .scale(75000)
    .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);

  pathGenerator = d3.geoPath().projection(projection);

  neighborhoodMap = d3
    .select("#map")
    .append("svg")
    .attr("width", MAP_WIDTH)
    .attr("height", MAP_HEIGHT);
}

function showStreets() {
  neighborhoodMap
    .selectAll("path.streets")
    .data(streets)
    .enter()
    .append("path")
    .attr("class", "streets")
    .attr("d", pathGenerator)
    .style("fill", "transparent")
    .style("stroke", "lightgrey");
}

function showNeighborhoods() {
  neighborhoodMap
    .selectAll("path.neighborhoods")
    .data(neighborhoods)
    .enter()
    .append("path")
    .attr("class", "neighborhoods")
    .attr("id", (d) => d.properties.NOM_OFFICIEL)
    .attr("d", pathGenerator)
    .style("fill", "transparent")
    .style("stroke", "#212121")
    .on("click", function () {
      var initialMiniMapStatus = isMiniMapOpen;
      if (initialMiniMapStatus) {
        d3.selectAll("#neighborhoodname h2").remove();
        d3.selectAll("#minimap svg").remove();
        d3.selectAll("#spaces tr").remove();
        d3.selectAll("#instruct .caption").remove();
        d3.selectAll("#areainfo .caption").remove();
        d3.select("#spaces").attr("data-sortable-initialized", "false");
        d3.select("#spacescontainer").style(
          "border-top",
          "1px solid transparent"
        );
        d3.select("#spacescontainer").style(
          "border-bottom",
          "1px solid transparent"
        );
        d3.select("#spacescontainer").style(
          "border-right",
          "1px solid transparent"
        );
        isMiniMapOpen = false;
        d3.select(clicked)
          .transition()
          .style("fill", "transparent")
          .duration(250);
      }
      if (clicked != this || !initialMiniMapStatus) {
        d3.select(this)
          .attr("class", "selected")
          .transition()
          .style("fill", "#e4216f")
          .duration(250);
        d3.select("#instruct")
          .append()
          .attr("class", "caption")
          .text(
            "Survolez un élément dans la table pour voir son emplacement sur la carte."
          );
        createMiniMap(this);
        Sortable.init();
        clicked = this;
      }
    })
    .append("title")
    .text(function (d) {
      return d.properties.NOM_OFFICIEL;
    });
}

function showSpaces() {
  neighborhoodMap
    .selectAll("path.spaces")
    .data(spaces)
    .enter()
    .append("path")
    .attr("class", "spaces")
    .attr("d", pathGenerator)
    .style("fill", function (d) {
      return colorScale(d.properties.TYPO1);
    })
    .style("stroke", function (d) {
      return colorScale(d.properties.TYPO1);
    });
}

function createMiniMap(neighborhood) {
  isMiniMapOpen = true;

  neighborhoodInData = neighborhoods.find(
    (d) => d.properties.NOM_OFFICIEL == neighborhood.id
  );

  d3.select("#neighborhoodname").append("h2").html(neighborhood.id);

  d3.select("#spacescontainer").style("border-top", "1px solid #212121");
  d3.select("#spacescontainer").style("border-bottom", "1px solid #212121");
  d3.select("#spacescontainer").style("border-right", "1px solid #212121");

  var head = d3.select("#spaces thead").append("tr");
  head.append("th").html("Nom d'Espace");
  head.append("th").html("Superficie en metres carrés");
  head.append("th").html("Sous-type d'espace");

  miniProjection = d3
    .geoMercator()
    .center(turf.center(neighborhoodInData).geometry.coordinates)
    .fitSize([MINIMAP_WIDTH, MINIMAP_HEIGHT], neighborhoodInData);

  miniPathGenerator = d3.geoPath().projection(miniProjection);

  miniMap = d3
    .select("#minimap")
    .append("svg")
    .attr("width", MINIMAP_WIDTH)
    .attr("height", MINIMAP_HEIGHT);

  if (document.getElementById("streetscheckbox").checked) {
    showMiniStreets();
  }
  showMiniNeighborhood();
  showMiniSpaces();
  d3.select("#minimap").call(zoom);
  d3.select("#minimap").call(zoom.transform, d3.zoomIdentity);
}

function showMiniStreets() {
  var streetsInNeighborhood = [];
  var neighborhoodBbox = turf.bbox(neighborhoodInData);
  var streetsInBoundingBox = streets.filter((d) => {
    var streetBbox = turf.bbox(d);
    return (
      neighborhoodBbox[0] < streetBbox[2] &&
      neighborhoodBbox[2] > streetBbox[0] &&
      neighborhoodBbox[1] < streetBbox[3] &&
      neighborhoodBbox[3] > streetBbox[1]
    );
  });
  for (let i = 0; i < streetsInBoundingBox.length; i++) {
    if (turf.booleanIntersects(streetsInBoundingBox[i], neighborhoodInData)) {
      var splitters = turf.lineSplit(streetsInBoundingBox[i], neighborhoodInData);
      if (splitters.features.length > 0) {
        streetsInNeighborhood.push(...splitters.features.filter((d) => turf.booleanPointInPolygon(turf.center(d), neighborhoodInData)));
      }
      else {
      streetsInNeighborhood.push(streetsInBoundingBox[i]);
      }
    }
  }

  miniMap
    .selectAll("path.ministreets")
    .data(streetsInNeighborhood)
    .enter()
    .append("path")
    .attr("class", "ministreets")
    .attr("d", miniPathGenerator)
    .style("fill", "transparent")
    .style("stroke", "lightgrey");
}

function showMiniNeighborhood() {
  miniMap
    .selectAll("path.minineighborhood")
    .data([neighborhoodInData])
    .enter()
    .append("path")
    .attr("class", "minineighborhood")
    .attr("d", miniPathGenerator)
    .style("fill", "transparent")
    .style("stroke", "#212121");
}

function showMiniSpaces() {
  var spacesInNeighborhood = [];
  var neighborhoodBbox = turf.bbox(neighborhoodInData);
  var spacesArea = 0;
  var spacesInBoundingBox = spaces.filter((d) => {
    var spacesBbox = turf.bbox(d);
    return (
      neighborhoodBbox[0] < spacesBbox[2] &&
      neighborhoodBbox[2] > spacesBbox[0] &&
      neighborhoodBbox[1] < spacesBbox[3] &&
      neighborhoodBbox[3] > spacesBbox[1]
    );
  });
  for (let i = 0; i < spacesInBoundingBox.length; i++) {
    if (turf.booleanIntersects(spacesInBoundingBox[i], neighborhoodInData)) {
      var clippedSpace = turf.rewind(
        turf.intersect(turf.featureCollection([spacesInBoundingBox[i], neighborhoodInData])),
        { reverse: true }
      );
      clippedSpace.properties = spacesInBoundingBox[i].properties;
      spacesInNeighborhood.push(clippedSpace);
      spacesArea += turf.area(clippedSpace);
    }
  }

  miniMap
    .selectAll("path.minispaces")
    .data(spacesInNeighborhood)
    .enter()
    .append("path")
    .attr("class", "minispaces")
    .attr("d", miniPathGenerator)
    .style("fill", function (d) {
      return colorScale(d.properties.TYPO1);
    })
    .style("stroke", function (d) {
      return colorScale(d.properties.TYPO1);
    });

  spacesArea = spacesArea / 1e6;
  var spacesPercentage =
    (spacesArea / (turf.area(neighborhoodInData) / 1e6)) * 100;
  var spaceTypeString = "";
  if (spaceType != "Tout") {
    spaceTypeString = spaceType.toLowerCase();
  } else {
    spaceTypeString = "espace vert";
  }
  d3.select("#areainfo")
    .append()
    .attr("class", "caption")
    .text(
      neighborhoodInData.properties.NOM_OFFICIEL +
        " a " +
        spacesArea.toFixed(2) +
        " kilomètres carrés de " +
        spaceTypeString +
        " (" +
        spacesPercentage.toFixed(0) +
        "% de sa superficie totale)."
    );

  addRowsToTable(spacesInNeighborhood);
}

function addRowsToTable(spaces) {
  for (let i = 0; i < spaces.length; i++) {
    var row = d3.select("#spaces tbody").append("tr");
    var space = "";
    if (spaces[i].properties.Type != null) {
      space += spaces[i].properties.Type + " ";
    }
    if (spaces[i].properties.Lien != null) {
      space += spaces[i].properties.Lien + " ";
    }
    if (spaces[i].properties.Nom != null) {
      space += spaces[i].properties.Nom;
    }
    row.append("td").html(space);
    row.append("td").html((spaces[i].properties.SUPERFICIE * 10000).toFixed(2));
    row.append("td").html(spaces[i].properties.TYPO2);
    row.on("mouseover", function () {
      d3.select(this).style("background", "#e4216f");
      miniMap
        .selectAll("path.highlight")
        .data([spaces[i]])
        .enter()
        .append("path")
        .attr("class", "highlight")
        .attr("transform", d3.zoomTransform(d3.select("#minimap").node()))
        .attr("d", miniPathGenerator)
        .style("fill", "#e4216f")
        .style("stroke", "#e4216f");
    });
    row.on("mouseout", function () {
      d3.select(this).style("background", "transparent");
      d3.selectAll("path.highlight").remove();
    });
  }
}

document.getElementById("spacetypes").addEventListener("change", () => {
  d3.selectAll("path.spaces").remove();
  d3.selectAll("path.minispaces").remove();
  d3.selectAll("#spaces td").remove();
  d3.selectAll("#areainfo .caption").remove();
  var spaceTypes = document.getElementById("spacetypes");
  spaceType = spaceTypes.options[spaceTypes.selectedIndex].value;
  loadSpaces();
  showSpaces();
  if (isMiniMapOpen) {
    showMiniSpaces();
  }
});
document.getElementById("streetscheckbox").addEventListener("click", () => {
  if (document.getElementById("streetscheckbox").checked) {
    d3.selectAll("path.streets").remove();
    d3.selectAll("path.neighborhoods").remove();
    d3.selectAll("path.spaces").remove();
    showStreets();
    showNeighborhoods();
    showSpaces();
    if (isMiniMapOpen) {
      d3.selectAll("path.ministreets").remove();
      d3.selectAll("path.minineighborhood").remove();
      d3.selectAll("path.minispaces").remove();
      d3.selectAll("#spaces td").remove();
      d3.selectAll("#areainfo .caption").remove();
      showMiniStreets();
      showMiniNeighborhood();
      showMiniSpaces();
    }
  } else {
    d3.selectAll("path.streets").remove();
    d3.selectAll("path.ministreets").remove();
  }
});
loadData()
  .then(loadSpaces)
  .then(createMap)
  .then(showNeighborhoods)
  .then(showSpaces);
