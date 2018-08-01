/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Broad Institute
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var igv = (function (igv) {

    igv.KaryoPanel = function ($parent) {
        var self = this,
            contentDiv,
            canvas,
            tipCtx,
            tipCanvas,
            $canvas,
            w,
            h;

        this.$container = $('<div class="igv-karyo-div">');
        $parent.append(this.$container);

        this.$karyoPanelToggle = igv.makeToggleButton('Karyotype Panel', 'showKaryo', function () {
            return self.$container;
        }, undefined);

        this.ideograms = null;
        igv.guichromosomes = [];

        this.$content = $('<div class="igv-karyo-content-div"></div>');
        this.$container.append(this.$content);
        contentDiv = this.$content.get(0);

        $canvas = $('<canvas class="igv-karyo-canvas">');
        $(contentDiv).append($canvas);
        canvas = $canvas.get(0);

        w = this.$content.width();
        h = this.$content.height();

        canvas.style.width = (w + 'px');
        canvas.setAttribute('width', w);

        canvas.style.height = (h + 'px');
        canvas.setAttribute('height', h);

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        tipCanvas = document.createElement('canvas');
        tipCanvas.style.position = 'absolute';    // => relative to first positioned ancestor
        tipCanvas.style.width = "100px";
        tipCanvas.style.height = "20px";
        tipCanvas.style.left = "-2000px";
        tipCanvas.setAttribute('width', "100px");    //Must set the width & height of the canvas
        tipCanvas.setAttribute('height', "20px");

        tipCtx = tipCanvas.getContext("2d");
        contentDiv.appendChild(tipCanvas);

        this.canvas.onmousemove = function (e) {

            var mouseCoords = igv.translateMouseCoordinates(e, canvas);
            var mouseX = mouseCoords.x;
            var mouseY = mouseCoords.y;

            var hit = false;
            for (var i = 0; i < igv.guichromosomes.length; i++) {
                var g = igv.guichromosomes[i];
                if (g.x < mouseX && g.right > mouseX && g.y < mouseY && g.bottom > mouseY) {
                    var dy = mouseY - g.y;
                    var bp = Math.round(g.size * dy / g.h);

                    tipCanvas.style.left = Math.round(mouseX + 20) + "px";
                    tipCanvas.style.top = Math.round(mouseY - 5) + "px";

                    tipCtx.clearRect(0, 0, tipCanvas.width, tipCanvas.height);
                    tipCtx.fillStyle = 'rgb(255,255,220)';
                    tipCtx.fillRect(0, 0, tipCanvas.width, tipCanvas.height);
                    tipCtx.fillStyle = 'rgb(0,0,0)';
                    var mb = Math.round(bp / 1000000);
                    tipCtx.fillText(g.name + " @ " + mb + " MB", 3, 12);
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                tipCanvas.style.left = "-2000px";
            }
        };

        this.canvas.onclick = function (e) {
            var mouseCoords = igv.translateMouseCoordinates(e, canvas);
            igv.navigateKaryo(mouseCoords.x, mouseCoords.y);
        }

    };

    // Move location of the reference panel by clicking on the genome ideogram
    igv.navigateKaryo = function (mouseX, mouseY) {
        var i,
            g,
            dy,
            center;

        for (i = 0; i < igv.guichromosomes.length; i++) {

            g = igv.guichromosomes[i];

            if (g.x < mouseX && g.right > mouseX && g.y < mouseY && g.bottom > mouseY) {
                dy = mouseY - g.y;
                center = Math.round(g.size * dy / g.h);
                igv.browser.goto(g.name, center, undefined);
                break;
            }
        }

        igv.browser.updateViews();
    };

    igv.KaryoPanel.prototype.resize = function () {

        var w,
            h;

        w = this.$content.width();
        h = this.$content.height();

        this.canvas.style.width = (w + 'px');
        this.canvas.setAttribute('width', w);

        this.canvas.style.height = (h + 'px');
        this.canvas.setAttribute('height', h);

        this.ideograms = undefined;
        this.repaint();
    };

    igv.KaryoPanel.prototype.repaint = function () {

        var chr,
            genomicState,
            referenceFrame,
            stainColors,
            w,
            h;

        if(!igv.browser.genome.ideograms) {
            return;
        }

        genomicState = _.first(igv.browser.genomicStateList);
        referenceFrame = genomicState.referenceFrame;
        stainColors = [];
        w = this.canvas.width;
        h = this.canvas.height;


        this.ctx.clearRect(0, 0, w, h);

        if (!(igv.browser.genome && referenceFrame && igv.browser.genome.chromosomes && referenceFrame.chrName)) {
            return;
        }

        var chromosomes = igv.browser.genome.chromosomes;
        var image = this.ideograms;


        if (chromosomes.length < 1) {
            return;
        }

        var nrchr = 24;
        var nrrows = 1;
        if (w < 300) nrrows = 2;

        var totalchrwidth = Math.min(50, (w - 20) / (nrchr + 2) * nrrows);

        var chrwidth = Math.min(20, totalchrwidth / 2);
        // allow for 2 rows!

        var top = 25;
        var chrheight = ((h-25) / nrrows) - top;

        var longestChr = igv.browser.genome.getLongestChromosome();
        var cytobands = igv.browser.genome.getCytobands(longestChr.name);      // Longest chr

        if(!cytobands) return;    // Cytobands not defined.

        var me = this;
        var maxLen = cytobands[cytobands.length - 1].end;

        if (!image || image === null) {
            drawImage.call(this);
        }

        this.ctx.drawImage(image, 0, 0);

        // Draw red box
        this.ctx.save();

        // Translate chr to official name
        chr = igv.browser.genome.getChromosomeName( referenceFrame.chrName );
        var chromosome = igv.browser.genome.getChromosome(chr);

        if (chromosome) {
            var ideoScale = longestChr.bpLength / chrheight;   // Scale in bp per pixels

            var boxPY1 = chromosome.y - 3 + Math.round(referenceFrame.start / ideoScale);
            var boxHeight = Math.max(3, ((igv.browser.viewportContainerWidth()/igv.browser.genomicStateList.length) * referenceFrame.bpPerPixel) / ideoScale);

            //var boxPY2 = Math.round((referenceFrame.start+100) * ideoScale);
            this.ctx.strokeStyle = "rgb(150, 0, 0)";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(chromosome.x - 3, boxPY1, chrwidth + 6, boxHeight + 6);
            this.ctx.restore();
        }

        function drawImage() {
            var i,
                bufferCtx,
                nr,
                col,
                row,
                y,
                chromosome,
                guichrom,
                chr;

            image = document.createElement('canvas');
            image.width = w;
            image.height = h;

            bufferCtx = image.getContext('2d');
            nr = 0;
            col = 0;
            row = 1;
            y = top;

            igv.guichromosomes = [];
            for (chr in chromosomes) {

                if (nr > nrchr) {
                    break;
                }

                if (row === 1 && nrrows === 2 && nr + 1 > nrchr / 2) {
                    row = 2;
                    col = 0;
                    y = y + chrheight + top;
                }

                nr++;
                col++;

                chromosome = igv.browser.genome.getChromosome(chr);

                if (chr === 'chrM' && !chromosome.bpLength) {
                    chromosome.bpLength = 16000;
                }

                chromosome.x = col * totalchrwidth;
                chromosome.y = y;

                guichrom = {};
                guichrom.name = chr;

                igv.guichromosomes.push(guichrom);

                drawIdeogram(guichrom, chromosome.x, chromosome.y, chromosome, bufferCtx, chrwidth, chrheight, maxLen);

            }

            this.ideograms = image;

            var tracknr = 0;
            for (i = 0; i < igv.browser.trackViews.length; i++) {
                var trackPanel = igv.browser.trackViews[i];
                var track = trackPanel.track;
                if (track.getSummary && track.loadSummary) {
                    var source = track;

                    window.source = track;
                    source.loadSummary("chr1", 0, 1000000, function (featureList) {
                        if (featureList) {
                            nr = 0;
                            for (chr in chromosomes) {
                                var guichrom = igv.guichromosomes[nr];
                                //if (nr > 1) break;
                                nr++;
                                if (guichrom && guichrom.size) {
                                    loadfeatures(source, chr, 0, guichrom.size, guichrom, bufferCtx, tracknr);
                                }
                            }
                        }
                    });
                    tracknr++;
                }
            }
        }

        function drawFeatures(source, featurelist, guichrom, ideogramLeft, top, bufferCtx, ideogramWidth, ideogramHeight, longestChr, tracknr) {
            var i,
                scale,
                feature,
                color,
                value,
                dx,
                starty,
                endy,
                dy;

            if (igv.browser.genome && guichrom && featurelist && featurelist.length > 0) {

                scale = ideogramHeight / longestChr;
                dx = 1;

                for (i = 0; i < featurelist.length; i++) {

                    feature = featurelist[i];
                    color = 'rgb(0,0,150)';
                    value = feature.score;

                    if (source.getColor) {
                        color = source.getColor(value);
                    }

                    starty = scale * feature.start + top;
                    endy = scale * feature.end + top;
                    dy = Math.max(0.01, endy - starty);

                    bufferCtx.fillStyle = color;
                    bufferCtx.fillRect(ideogramLeft + ideogramWidth + tracknr * 2 + 1, starty, dx, dy);

                }

            }
        }

        function drawIdeogram(guichrom, ideogramLeft, top, chromosome, bufferCtx, ideogramWidth, ideogramHeight, longestChr) {
            var i,
                cytobands,
                centerx,
                xC,
                yC,
                scale,
                last,
                lastPY,
                MINH,
                starty,
                endy,
                dy,
                r,
                name;

            if (igv.browser.genome && chromosome) {
                cytobands = igv.browser.genome.getCytobands(chromosome.name);

                if (cytobands) {

                    centerx = (ideogramLeft + ideogramWidth / 2);
                    xC = [];
                    yC = [];
                    scale = ideogramHeight / longestChr;

                    guichrom.x = ideogramLeft;
                    guichrom.y = top;
                    guichrom.w = ideogramWidth;
                    guichrom.right = ideogramLeft + ideogramWidth;
                    last = 0;
                    lastPY = -1;
                    if (cytobands.length > 0) {
                        last = cytobands[cytobands.length - 1].end;
                        guichrom.h = scale * last;
                        guichrom.size = last;
                    } else {
                        MINH = 5;
                        lastPY = top + MINH;
                        guichrom.h = MINH;
                        guichrom.size = MINH / scale;
                    }

                    guichrom.longest = longestChr;
                    guichrom.bottom = top + guichrom.h;

                    if (cytobands.length > 0) {
                        for (i = 0; i < cytobands.length; i++) {

                            starty = scale * cytobands[i].start + top;
                            endy = scale * cytobands[i].end + top;
                            if (endy > lastPY) {
                                if (cytobands[i].type === 'c') {
                                    if (cytobands[i].name.charAt(0) === 'p') {
                                        yC[0] = starty;
                                        xC[0] = ideogramWidth + ideogramLeft;
                                        yC[1] = starty;
                                        xC[1] = ideogramLeft;
                                        yC[2] = endy;
                                        xC[2] = centerx;
                                    } else {
                                        yC[0] = endy;
                                        xC[0] = ideogramWidth + ideogramLeft;
                                        yC[1] = endy;
                                        xC[1] = ideogramLeft;
                                        yC[2] = starty;
                                        xC[2] = centerx;
                                    }
                                    bufferCtx.fillStyle = "rgb(220, 150, 100)";
                                    bufferCtx.strokeStyle = "rgb(150, 0, 0)";
                                    igv.graphics.polygon(bufferCtx, xC, yC, 1, 0);
                                } else {
                                    dy = endy - starty;
                                    bufferCtx.fillStyle = getCytobandColor(cytobands[i]);
                                    bufferCtx.fillRect(ideogramLeft, starty, ideogramWidth, dy);
                                }
                            }

                            lastPY = endy;
                        }

                    }
                }

                bufferCtx.fillStyle = null;
                bufferCtx.lineWidth = 1;
                bufferCtx.strokeStyle = "darkgray";

                r = ideogramWidth / 2;
                igv.graphics.roundRect(bufferCtx, ideogramLeft, top - r / 2, ideogramWidth, lastPY - top + r, ideogramWidth / 2, 0, 1);

                bufferCtx.font = "bold 10px Arial";
                bufferCtx.fillStyle = "rgb(0, 0, 0)";

                name = chromosome.name;
                if (name.length > 3) {
                    name = name.substring(3);
                }
                bufferCtx.fillText(name, ideogramLeft + ideogramWidth / 2 - 3 * name.length, top - 10);

            }
        }

        function getCytobandColor(data) {
            var stain,
                shade;

            if (data.type === 'c') {
                return "rgb(150, 10, 10)"
            } else {
                stain = data.stain;
                shade = 230;

                if (data.type === 'p') {
                    shade = Math.floor(230 - stain / 100.0 * 230);
                }

                if (undefined === stainColors[ shade ]) {
                    stainColors[ shade ] = "rgb(" + shade + "," + shade + "," + shade + ")";
                }

                return stainColors[ shade ];
            }
        }

        function loadfeatures(source, chr, start, end, guichrom, bufferCtx, tracknr) {

            source.getSummary(chr, start, end, function (featureList) {
                if (featureList) {
                    drawFeatures(source, featureList, guichrom, guichrom.x, guichrom.y, bufferCtx, chrwidth, chrheight, maxLen, tracknr);
                    me.repaint();
                }
            });
        }

    };

    return igv;
})
(igv || {});
