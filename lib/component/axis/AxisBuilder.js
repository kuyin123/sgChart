

    var zrUtil = require('zrender/lib/core/util');
    var formatUtil = require('../../util/format');
    var graphic = require('../../util/graphic');
    var Model = require('../../model/Model');
    var numberUtil = require('../../util/number');
    var remRadian = numberUtil.remRadian;
    var isRadianAroundZero = numberUtil.isRadianAroundZero;
    var vec2 = require('zrender/lib/core/vector');
    var matrix = require('zrender/lib/core/matrix');
    var v2ApplyTransform = vec2.applyTransform;
    var retrieve = zrUtil.retrieve;

    var PI = Math.PI;

    function makeAxisEventDataBase(axisModel) {
        var eventData = {
            componentType: axisModel.mainType
        };
        eventData[axisModel.mainType + 'Index'] = axisModel.componentIndex;
        return eventData;
    }

    /**
     * A final axis is translated and rotated from a "standard axis".
     * So opt.position and opt.rotation is required.
     *
     * A standard axis is and axis from [0, 0] to [0, axisExtent[1]],
     * for example: (0, 0) ------------> (0, 50)
     *
     * nameDirection or tickDirection or labelDirection is 1 means tick
     * or label is below the standard axis, whereas is -1 means above
     * the standard axis. labelOffset means offset between label and axis,
     * which is useful when 'onZero', where axisLabel is in the grid and
     * label in outside grid.
     *
     * Tips: like always,
     * positive rotation represents anticlockwise, and negative rotation
     * represents clockwise.
     * The direction of position coordinate is the same as the direction
     * of screen coordinate.
     *
     * Do not need to consider axis 'inverse', which is auto processed by
     * axis extent.
     *
     * @param {module:zrender/container/Group} group
     * @param {Object} axisModel
     * @param {Object} opt Standard axis parameters.
     * @param {Array.<number>} opt.position [x, y]
     * @param {number} opt.rotation by radian
     * @param {number} [opt.nameDirection=1] 1 or -1 Used when nameLocation is 'middle'.
     * @param {number} [opt.tickDirection=1] 1 or -1
     * @param {number} [opt.labelDirection=1] 1 or -1
     * @param {number} [opt.labelOffset=0] Usefull when onZero.
     * @param {string} [opt.axisLabelShow] default get from axisModel.
     * @param {string} [opt.axisName] default get from axisModel.
     * @param {number} [opt.axisNameAvailableWidth]
     * @param {number} [opt.labelRotate] by degree, default get from axisModel.
     * @param {number} [opt.labelInterval] Default label interval when label
     *                                     interval from model is null or 'auto'.
     * @param {number} [opt.strokeContainThreshold] Default label interval when label
     * @param {number} [opt.nameTruncateMaxWidth]
     */
    var AxisBuilder = function (axisModel, opt) {

        /**
         * @readOnly
         */
        this.opt = opt;

        /**
         * @readOnly
         */
        this.axisModel = axisModel;

        // Default value
        zrUtil.defaults(
            opt,
            {
                labelOffset: 0,
                nameDirection: 1,
                tickDirection: 1,
                labelDirection: 1,
                silent: true
            }
        );

        /**
         * @readOnly
         */
        this.group = new graphic.Group();

        // FIXME Not use a seperate text group?
        var dumbGroup = new graphic.Group({
            position: opt.position.slice(),
            rotation: opt.rotation
        });

        // this.group.add(dumbGroup);
        // this._dumbGroup = dumbGroup;

        dumbGroup.updateTransform();
        this._transform = dumbGroup.transform;

        this._dumbGroup = dumbGroup;
    };

    AxisBuilder.prototype = {

        constructor: AxisBuilder,

        hasBuilder: function (name) {
            return !!builders[name];
        },

        add: function (name) {
            builders[name].call(this);
        },

        getGroup: function () {
            return this.group;
        }

    };

    var builders = {

        /**
         * @private
         */
        axisLine: function () {
            var opt = this.opt;
            var axisModel = this.axisModel;

            if (!axisModel.get('axisLine.show')) {
                return;
            }

            var extent = this.axisModel.axis.getExtent();

            var matrix = this._transform;
            var pt1 = [extent[0], 0];
            var pt2 = [extent[1], 0];
            if (matrix) {
                v2ApplyTransform(pt1, pt1, matrix);
                v2ApplyTransform(pt2, pt2, matrix);
            }

            this.group.add(new graphic.Line(graphic.subPixelOptimizeLine({

                // Id for animation
                anid: 'line',

                shape: {
                    x1: pt1[0] + 20,
                    y1: pt1[1],
                    x2: pt2[0],
                    y2: pt2[1]
                },
                style: zrUtil.extend(
                    {lineCap: 'round'},
                    axisModel.getModel('axisLine.lineStyle').getLineStyle()
                ),
                strokeContainThreshold: opt.strokeContainThreshold || 5,
                silent: true,
                z2: 1
            })));
        },

        /**
         * @private
         */
        axisTick: function () {
            var axisModel = this.axisModel;
            var axis = axisModel.axis;

            if (!axisModel.get('axisTick.show') || axis.scale.isBlank()) {
                return;
            }

            var tickModel = axisModel.getModel('axisTick');
            var opt = this.opt;

            var lineStyleModel = tickModel.getModel('lineStyle');
            var tickLen = tickModel.get('length');

            var tickInterval = getInterval(tickModel, opt.labelInterval);
            var ticksCoords = axis.getTicksCoords(tickModel.get('alignWithLabel'));
            var ticks = axis.scale.getTicks();

            var pt1 = [];
            var pt2 = [];
            var matrix = this._transform;

            for (var i = 0; i < ticksCoords.length; i++) {
                // Only ordinal scale support tick interval
                if (ifIgnoreOnTick(axis, i, tickInterval)) {
                     continue;
                }

                var tickCoord = ticksCoords[i];

                pt1[0] = tickCoord;
                pt1[1] = 0;
                pt2[0] = tickCoord;
                pt2[1] = opt.tickDirection * tickLen;

                if (matrix) {
                    v2ApplyTransform(pt1, pt1, matrix);
                    v2ApplyTransform(pt2, pt2, matrix);
                }
                // Tick line, Not use group transform to have better line draw
                this.group.add(new graphic.Line(graphic.subPixelOptimizeLine({

                    // Id for animation
                    anid: 'tick_' + ticks[i],

                    shape: {
                        x1: pt1[0],
                        y1: pt1[1],
                        x2: pt2[0],
                        y2: pt2[1]
                    },
                    style: zrUtil.defaults(
                        lineStyleModel.getLineStyle(),
                        {
                            stroke: axisModel.get('axisLine.lineStyle.color')
                        }
                    ),
                    z2: 2,
                    silent: true
                })));
            }
        },

        /**
         * @param {module:echarts/coord/cartesian/AxisModel} axisModel
         * @param {module:echarts/coord/cartesian/GridModel} gridModel
         * @private
         */
        axisLabel: function () {
            var opt = this.opt;
            var axisModel = this.axisModel;
            var axis = axisModel.axis;
            var show = retrieve(opt.axisLabelShow, axisModel.get('axisLabel.show'));

            if (!show || axis.scale.isBlank()) {
                return;
            }

            var labelModel = axisModel.getModel('axisLabel');
            var textStyleModel = labelModel.getModel('textStyle');
            var labelMargin = labelModel.get('margin');
            var ticks = axis.scale.getTicks();
            var labels = axisModel.getFormattedLabels();

            // Special label rotate.
            var labelRotation = (
                retrieve(opt.labelRotate, labelModel.get('rotate')) || 0
            ) * PI / 180;

            var labelLayout = innerTextLayout(opt.rotation, labelRotation, opt.labelDirection);
            var categoryData = axisModel.get('data');

            var textEls = [];
            var silent = isSilent(axisModel);
            var triggerEvent = axisModel.get('triggerEvent');

            zrUtil.each(ticks, function (tickVal, index) {
                if (ifIgnoreOnTick(axis, index, opt.labelInterval)) {
                     return;
                }

                var itemTextStyleModel = textStyleModel;
                if (categoryData && categoryData[tickVal] && categoryData[tickVal].textStyle) {
                    itemTextStyleModel = new Model(
                        categoryData[tickVal].textStyle, textStyleModel, axisModel.ecModel
                    );
                }
                var textColor = itemTextStyleModel.getTextColor()
                    || axisModel.get('axisLine.lineStyle.color');

                var tickCoord = axis.dataToCoord(tickVal);
                var pos = [
                    tickCoord,
                    opt.labelOffset + opt.labelDirection * labelMargin
                ];
                var labelStr = axis.scale.getLabel(tickVal);

                var textEl = new graphic.Text({

                    // Id for animation
                    anid: 'label_' + tickVal,

                    style: {
                        text: labels[index],
                        textAlign: itemTextStyleModel.get('align', true) || labelLayout.textAlign,
                        textVerticalAlign: itemTextStyleModel.get('baseline', true) || labelLayout.textVerticalAlign,
                        textFont: itemTextStyleModel.getFont(),
                        fill: typeof textColor === 'function'
                            ? textColor(
                                // (1) In category axis with data zoom, tick is not the original
                                // index of axis.data. So tick should not be exposed to user
                                // in category axis.
                                // (2) Compatible with previous version, which always returns labelStr.
                                // But in interval scale labelStr is like '223,445', which maked
                                // user repalce ','. So we modify it to return original val but remain
                                // it as 'string' to avoid error in replacing.
                                axis.type === 'category' ? labelStr : axis.type === 'value' ? tickVal + '' : tickVal,
                                index
                            )
                            : textColor
                    },
                    position: pos,
                    rotation: labelLayout.rotation,
                    silent: silent,
                    z2: 10
                });

                // Pack data for mouse event
                if (triggerEvent) {
                    textEl.eventData = makeAxisEventDataBase(axisModel);
                    textEl.eventData.targetType = 'axisLabel';
                    textEl.eventData.value = labelStr;
                }

                // FIXME
                this._dumbGroup.add(textEl);
                textEl.updateTransform();

                textEls.push(textEl);
                this.group.add(textEl);

                textEl.decomposeTransform();

            }, this);

            fixMinMaxLabelShow(axisModel, textEls);
        },

        /**
         * @private
         */
        axisName: function () {
            var opt = this.opt;
            var axisModel = this.axisModel;
            var name = retrieve(opt.axisName, axisModel.get('name'));

            if (!name) {
                return;
            }

            var nameLocation = axisModel.get('nameLocation');
            var nameDirection = opt.nameDirection;
            var textStyleModel = axisModel.getModel('nameTextStyle');
            var gap = axisModel.get('nameGap') || 0;

            var extent = this.axisModel.axis.getExtent();
            var gapSignal = extent[0] > extent[1] ? -1 : 1;
            var pos = [
                nameLocation === 'start'
                    ? extent[0] - gapSignal * gap
                    : nameLocation === 'end'
                    ? extent[1] + gapSignal * gap
                    : (extent[0] + extent[1]) / 2, // 'middle'
                // Reuse labelOffset.
                nameLocation === 'middle' ? opt.labelOffset + nameDirection * gap : 0
            ];

            var labelLayout;

            var nameRotation = axisModel.get('nameRotate');
            if (nameRotation != null) {
                nameRotation = nameRotation * PI / 180; // To radian.
            }

            var axisNameAvailableWidth;

            if (nameLocation === 'middle') {
                labelLayout = innerTextLayout(
                    opt.rotation,
                    nameRotation != null ? nameRotation : opt.rotation, // Adapt to axis.
                    nameDirection
                );
            }
            else {
                labelLayout = endTextLayout(
                    opt, nameLocation, nameRotation || 0, extent
                );

                axisNameAvailableWidth = opt.axisNameAvailableWidth;
                if (axisNameAvailableWidth != null) {
                    axisNameAvailableWidth = Math.abs(
                        axisNameAvailableWidth / Math.sin(labelLayout.rotation)
                    );
                    !isFinite(axisNameAvailableWidth) && (axisNameAvailableWidth = null);
                }
            }

            var textFont = textStyleModel.getFont();

            var truncateOpt = axisModel.get('nameTruncate', true) || {};
            var ellipsis = truncateOpt.ellipsis;
            var maxWidth = retrieve(
                opt.nameTruncateMaxWidth, truncateOpt.maxWidth, axisNameAvailableWidth
            );
            var truncatedText = (ellipsis != null && maxWidth != null)
                ? formatUtil.truncateText(
                    name, maxWidth, textFont, ellipsis,
                    {minChar: 2, placeholder: truncateOpt.placeholder}
                )
                : name;

            var tooltipOpt = axisModel.get('tooltip', true);

            var mainType = axisModel.mainType;
            var formatterParams = {
                componentType: mainType,
                name: name,
                $vars: ['name']
            };
            formatterParams[mainType + 'Index'] = axisModel.componentIndex;

            var textEl = new graphic.Text({

                // Id for animation
                anid: 'name',

                __fullText: name,
                __truncatedText: truncatedText,

                style: {
                    text: truncatedText,
                    textFont: textFont,
                    fill: textStyleModel.getTextColor()
                        || axisModel.get('axisLine.lineStyle.color'),
                    textAlign: labelLayout.textAlign,
                    textVerticalAlign: labelLayout.textVerticalAlign
                },
                position: pos,
                rotation: labelLayout.rotation,
                silent: isSilent(axisModel),
                z2: 1,
                tooltip: (tooltipOpt && tooltipOpt.show)
                    ? zrUtil.extend({
                        content: name,
                        formatter: function () {
                            return name;
                        },
                        formatterParams: formatterParams
                    }, tooltipOpt)
                    : null
            });

            if (axisModel.get('triggerEvent')) {
                textEl.eventData = makeAxisEventDataBase(axisModel);
                textEl.eventData.targetType = 'axisName';
                textEl.eventData.name = name;
            }

            // FIXME
            this._dumbGroup.add(textEl);
            textEl.updateTransform();

            this.group.add(textEl);

            textEl.decomposeTransform();
        }

    };

    /**
     * @public
     * @static
     * @param {Object} opt
     * @param {number} axisRotation in radian
     * @param {number} textRotation in radian
     * @param {number} direction
     * @return {Object} {
     *  rotation, // according to axis
     *  textAlign,
     *  textVerticalAlign
     * }
     */
    var innerTextLayout = AxisBuilder.innerTextLayout = function (axisRotation, textRotation, direction) {
        var rotationDiff = remRadian(textRotation - axisRotation);
        var textAlign;
        var textVerticalAlign;

        if (isRadianAroundZero(rotationDiff)) { // Label is parallel with axis line.
            textVerticalAlign = direction > 0 ? 'top' : 'bottom';
            textAlign = 'center';
        }
        else if (isRadianAroundZero(rotationDiff - PI)) { // Label is inverse parallel with axis line.
            textVerticalAlign = direction > 0 ? 'bottom' : 'top';
            textAlign = 'center';
        }
        else {
            textVerticalAlign = 'middle';

            if (rotationDiff > 0 && rotationDiff < PI) {
                textAlign = direction > 0 ? 'right' : 'left';
            }
            else {
                textAlign = direction > 0 ? 'left' : 'right';
            }
        }

        return {
            rotation: rotationDiff,
            textAlign: textAlign,
            textVerticalAlign: textVerticalAlign
        };
    };

    function endTextLayout(opt, textPosition, textRotate, extent) {
        var rotationDiff = remRadian(textRotate - opt.rotation);
        var textAlign;
        var textVerticalAlign;
        var inverse = extent[0] > extent[1];
        var onLeft = (textPosition === 'start' && !inverse)
            || (textPosition !== 'start' && inverse);

        if (isRadianAroundZero(rotationDiff - PI / 2)) {
            textVerticalAlign = onLeft ? 'bottom' : 'top';
            textAlign = 'center';
        }
        else if (isRadianAroundZero(rotationDiff - PI * 1.5)) {
            textVerticalAlign = onLeft ? 'top' : 'bottom';
            textAlign = 'center';
        }
        else {
            textVerticalAlign = 'middle';
            if (rotationDiff < PI * 1.5 && rotationDiff > PI / 2) {
                textAlign = onLeft ? 'left' : 'right';
            }
            else {
                textAlign = onLeft ? 'right' : 'left';
            }
        }

        return {
            rotation: rotationDiff,
            textAlign: textAlign,
            textVerticalAlign: textVerticalAlign
        };
    }

    function isSilent(axisModel) {
        var tooltipOpt = axisModel.get('tooltip');
        return axisModel.get('silent')
            // Consider mouse cursor, add these restrictions.
            || !(
                axisModel.get('triggerEvent') || (tooltipOpt && tooltipOpt.show)
            );
    }

    function fixMinMaxLabelShow(axisModel, textEls) {
        // If min or max are user set, we need to check
        // If the tick on min(max) are overlap on their neighbour tick
        // If they are overlapped, we need to hide the min(max) tick label
        var showMinLabel = axisModel.get('axisLabel.showMinLabel');
        var showMaxLabel = axisModel.get('axisLabel.showMaxLabel');
        var firstLabel = textEls[0];
        var nextLabel = textEls[1];
        var lastLabel = textEls[textEls.length - 1];
        var prevLabel = textEls[textEls.length - 2];

        if (showMinLabel === false) {
            firstLabel.ignore = true;
        }
        else if (axisModel.getMin() != null && isTwoLabelOverlapped(firstLabel, nextLabel)) {
            showMinLabel ? (nextLabel.ignore = true) : (firstLabel.ignore = true);
        }

        if (showMaxLabel === false) {
            lastLabel.ignore = true;
        }
        else if (axisModel.getMax() != null && isTwoLabelOverlapped(prevLabel, lastLabel)) {
            showMaxLabel ? (prevLabel.ignore = true) : (lastLabel.ignore = true);
        }
    }

    function isTwoLabelOverlapped(current, next, labelLayout) {
        // current and next has the same rotation.
        var firstRect = current && current.getBoundingRect().clone();
        var nextRect = next && next.getBoundingRect().clone();

        if (!firstRect || !nextRect) {
            return;
        }

        // When checking intersect of two rotated labels, we use mRotationBack
        // to avoid that boundingRect is enlarge when using `boundingRect.applyTransform`.
        var mRotationBack = matrix.identity([]);
        matrix.rotate(mRotationBack, mRotationBack, -current.rotation);

        firstRect.applyTransform(matrix.mul([], mRotationBack, current.getLocalTransform()));
        nextRect.applyTransform(matrix.mul([], mRotationBack, next.getLocalTransform()));

        return firstRect.intersect(nextRect);
    }


    /**
     * @static
     */
    var ifIgnoreOnTick = AxisBuilder.ifIgnoreOnTick = function (axis, i, interval) {
        var rawTick;
        var scale = axis.scale;
        return scale.type === 'ordinal'
            && (
                typeof interval === 'function'
                    ? (
                        rawTick = scale.getTicks()[i],
                        !interval(rawTick, scale.getLabel(rawTick))
                    )
                    : i % (interval + 1)
            );
    };

    /**
     * @static
     */
    var getInterval = AxisBuilder.getInterval = function (model, labelInterval) {
        var interval = model.get('interval');
        if (interval == null || interval == 'auto') {
            interval = labelInterval;
        }
        return interval;
    };

    module.exports = AxisBuilder;

