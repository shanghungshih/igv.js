
import FeatureSource from '../feature/featureSource.js';
import TrackBase from "../trackBase.js";
import IGVGraphics from "../igv-canvas.js";
import {createCheckbox} from "../igv-icons.js";
import {extend, isSimpleType} from "../util/igvUtils.js";
import {numberFormatter} from "../util/stringUtils.js";
import paintAxis from "../util/paintAxis.js";
import MenuUtils from "../ui/menuUtils.js";

const X_PIXEL_DIFF_THRESHOLD = 1;
const dataRangeMenuItem = MenuUtils.dataRangeMenuItem;

const GCNVTrack = extend(TrackBase,

  function (config, browser) {
      TrackBase.call(this, config, browser);
      this.autoscale = config.autoscale || config.max === undefined;
      this.dataRange = {
          min: config.min || 0,
          max: config.max
      }

      this.windowFunction = config.windowFunction || "mean";
      this.paintAxis = paintAxis;
      this.graphType = config.graphType || "bar";

      this.featureSource = new FeatureSource(this.config, browser.genome);
  });


GCNVTrack.prototype.postInit = async function () {

    this.header = await this.featureSource.getFileHeader();
}

GCNVTrack.prototype.menuItemList = function () {
    const self = this;
    const menuItems = [];
    menuItems.push(dataRangeMenuItem(this.trackView));

    menuItems.push({
        object: createCheckbox("Autoscale", self.autoscale),
        click: function () {
            self.autoscale = !self.autoscale;
            self.config.autoscale = self.autoscale;
            self.trackView.setDataRange(undefined, undefined, self.autoscale);
        }
    });

    return menuItems;
};


GCNVTrack.prototype.getFeatures = async function (chr, bpStart, bpEnd) {
    const chrFeatures = await this.featureSource.getFeatures(chr, 0, Number.MAX_VALUE); //bpStart, bpEnd);
    let prevIndex = undefined;
    let nextIndex = undefined;
    for (let i = 1; i < chrFeatures.length - 1; i++) {
        if (prevIndex === undefined && chrFeatures[i].end > bpStart) {
            prevIndex = i - 1;
        }
        if (nextIndex === undefined && chrFeatures[i].start > bpEnd) {
            nextIndex = i + 1;
            break;
        }
    }
    if (prevIndex === undefined) prevIndex = 0;
    if (nextIndex === undefined) nextIndex = chrFeatures.length;
    return chrFeatures.slice(prevIndex, nextIndex);
};


GCNVTrack.prototype.draw = function (options) {
    let self = this;

    const features = options.features;
    const ctx = options.context;
    const bpPerPixel = options.bpPerPixel;
    const bpStart = options.bpStart;
    const pixelWidth = options.pixelWidth;
    const pixelHeight = options.pixelHeight;
    const bpEnd = bpStart + pixelWidth * bpPerPixel + 1;

    ///let baselineColor;
    //if (typeof self.color === "string" && self.color.startsWith("rgb(")) {
    //    baselineColor = IGVColor.addAlpha(self.color, 0.1);
    //}

    const yScale = (yValue) => {
        return ( (self.dataRange.max - yValue) / (self.dataRange.max - self.dataRange.min) ) * pixelHeight
    };

    const getX = function (bpPosition) {
        let x = Math.floor((bpPosition - bpStart) / bpPerPixel);
        if (isNaN(x)) console.warn('isNaN(x). feature start ' + numberFormatter(bpPosition) + ' bp start ' + numberFormatter(bpStart));
        return x;
    };

    const drawGuideLines = function (options) {
        if (self.config.hasOwnProperty('guideLines')) {
            for (let line of self.config.guideLines) {
                if (line.hasOwnProperty('color') && line.hasOwnProperty('y') && line.hasOwnProperty('dotted')) {
                    let y = yScale(line.y);
                    let props = {
                        'strokeStyle': line['color'],
                        'strokeWidth': 2
                    };
                    if (line['dotted']) IGVGraphics.dashedLine(options.context, 0, y, options.pixelWidth, y, 5, props);
                    else IGVGraphics.strokeLine(options.context, 0, y, options.pixelWidth, y, props);
                }
            }
        }
    };

    if (features && features.length > 0) {

        if (self.dataRange.min === undefined) self.dataRange.min = 0;

        // Max can be less than min if config.min is set but max left to autoscale. If that's the case there is
        // nothing to paint.
        if (self.dataRange.max > self.dataRange.min) {
            const highlightSamples = this.config.highlightSamples;

            let previousEnd = -1;
            let previousValues = {};

            let highlightConnectorLines = [];
            let highlightFeatureLines = [];

            // clickDetectorCache allows fast retrieval of whether a mouse click hits a rendered line segment
            // by storing lists of rendered line segments, keyed by their right x coordinate in canvas pixel space.
            // this cache is regenerated on every draw.
            this.clickDetectorCache = {}

            for (let feature of features) {
                const x1 = getX(feature.start);
                const x2 = getX(feature.end);
                const previousX = previousEnd >= 0 ? getX(previousEnd) : x1;

                if (isNaN(x1) || isNaN(x2)) continue;
                if ((x1 - previousX < X_PIXEL_DIFF_THRESHOLD) && (x2 - x1 < X_PIXEL_DIFF_THRESHOLD)) continue;

                this.clickDetectorCache[x1] = [];
                this.clickDetectorCache[x2] = [];
                for (let i = 0; i < feature.values.length; i++) {
                    const sampleName = self.header[i];
                    const value = feature.values[i];
                    const y = yScale(value);
                    if (x1 - previousX >= X_PIXEL_DIFF_THRESHOLD) {
                        const previousValue = previousValues[sampleName]
                        const previousY = yScale(previousValue);
                        const highlightColor = highlightSamples && highlightSamples[sampleName];
                        if (highlightColor) {
                            highlightConnectorLines.push([previousX, previousY, x1, y, highlightColor])
                        } else {
                            IGVGraphics.strokeLine(ctx, previousX, previousY, x1, y, {strokeStyle: '#D9D9D9'});
                        }
                        this.clickDetectorCache[x1].push([previousX, previousY, x1, y, sampleName, highlightColor || 'gray'])
                    }

                    if (x2 - x1 >= X_PIXEL_DIFF_THRESHOLD) {
                        const highlightColor = highlightSamples && highlightSamples[sampleName];
                        if (highlightColor) {
                            highlightFeatureLines.push([x1, y, x2, y, highlightColor])
                        } else {
                            IGVGraphics.strokeLine(ctx, x1, y, x2, y, {strokeStyle: 'gray'});
                        }
                        this.clickDetectorCache[x2].push([x1, y, x2, y, sampleName, highlightColor || 'gray'])
                    }

                    previousValues[sampleName] = value;

                    //IGVGraphics.fillCircle(ctx, px, y, pointSize / 2, {"fillStyle": color, "strokeStyle": color});
                    //IGVGraphics.fillRect(ctx, x, y, width, height, {fillStyle: color});
                }
                previousEnd = feature.end;
            }

            for (let f of highlightConnectorLines) {
                IGVGraphics.strokeLine(ctx, f[0], f[1], f[2], f[3], {strokeStyle: f[4], lineWidth: 1.3});
            }
            for (let f of highlightFeatureLines) {
                IGVGraphics.strokeLine(ctx, f[0], f[1], f[2], f[3], {strokeStyle: f[4], lineWidth: 2});
            }

            /*
            // If the track includes negative values draw a baseline
            if (self.dataRange.min < 0) {
                const basepx = (self.dataRange.max / (self.dataRange.max - self.dataRange.min)) * options.pixelHeight;
                IGVGraphics.strokeLine(ctx, 0, basepx, options.pixelWidth, basepx, {strokeStyle: baselineColor});
            }
            */
        }
    }

    drawGuideLines(options);
};


GCNVTrack.prototype.doAutoscale = function(features) {

    let min, max;
    if (features.length > 0) {
        min = Number.MAX_VALUE;
        max = -Number.MAX_VALUE;

        features.forEach(function(feature) {
            min = Math.min(min, ...feature.values);
            max = Math.max(max, ...feature.values);
        });

        min -= 0.01;
        max += 0.01;
    } else {
        // No features -- default
        min = 0;
        max = 100;
    }

    return {min: min, max: max};
}


const distanceToLine = (x, y, ax, ay, bx, by) => {
    /*
        Finds distance between point (x, y) and line defined by points (ax, ay) (bx, by)
        based on http://mathworld.wolfram.com/Point-LineDistance2-Dimensional.html
    */

    const bx_minus_ax = bx - ax;
    const by_minus_ay = by - ay;
    const v = Math.abs(bx_minus_ax * (ay - y) - (ax - x) * by_minus_ay)
    const r = Math.sqrt(bx_minus_ax * bx_minus_ax + by_minus_ay * by_minus_ay)

    const distance = r > 0 ? v / r : 0;
    //console.warn('Check if', x, y, 'is within', ax, ay, bx, by, '. Distance from line: ', distance);

    return distance;
}


GCNVTrack.prototype.clickedFeatures = function (clickState) {
    //console.warn('click', clickState.canvasX, clickState.canvasY, clickState)

    const BOUNDING_BOX_PADDING = 10;
    const MIN_DISTANCE_TO_SEGMENT = 5;

    const clickX = clickState.canvasX;
    const clickY = clickState.canvasY;

    let key = null;
    for(key of Object.keys(this.clickDetectorCache)) {
        key = parseInt(key)
        if(key >= clickX) {
            break
        }
    }


    if (key) {
        let closestDistanceSoFar = Number.MAX_VALUE;
        let closestResult = [];
        const segments = this.clickDetectorCache[key]
        for (let segment of segments) {
            const x1 = segment[0];
            const x2 = segment[2];
            if (clickX < x1 || clickX > x2)  return [];

            const y1 = segment[1];
            const y2 = segment[3];

            if ((clickY < Math.min(y1, y2) - BOUNDING_BOX_PADDING) || (clickY > Math.max(y1, y2) + BOUNDING_BOX_PADDING))  continue;

            const distance = distanceToLine(clickX, clickY, x1, y1, x2, y2)
            if (distance < closestDistanceSoFar) {
                closestResult  = [{'name': segment[4], 'color': segment[5]}];
                closestDistanceSoFar = distance;
                //console.warn('closest:', 'name', segment[4], 'color', segment[5], distance);
            }
        }

        if (closestDistanceSoFar < MIN_DISTANCE_TO_SEGMENT) {
            return closestResult;
        }
    }

    return [];
}

GCNVTrack.prototype.popupData = function (clickState, featureList) {

    if (!featureList) featureList = this.clickedFeatures(clickState);

    const items = [];
    featureList.forEach(function (f) {
        for (let property of Object.keys(f)) {
            if (isSimpleType(f[property])) {
                items.push({name: property, value: f[property]});
            }
        }
    });

    return items;
}

GCNVTrack.prototype.contextMenuItemList = function (clickState) {

    const self = this;
    const referenceFrame = clickState.viewport.genomicState.referenceFrame;
    const genomicLocation = clickState.genomicLocation;

    return [];
};

GCNVTrack.prototype.getState = function () {

    let config = this.config;

    config.autoscale = this.autoscale;

    if (!this.autoscale && this.dataRange) {
        config.min = this.dataRange.min;
        config.max = this.dataRange.max;
    }

    return config;

}

GCNVTrack.prototype.supportsWholeGenome = function () {
    return false;
}



export default GCNVTrack;
