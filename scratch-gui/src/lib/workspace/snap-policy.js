const DEFAULT_SNAP_RADIUS = 48;
const DEFAULT_CONNECTING_RADIUS = 68;
const DEFAULT_PREFERENCE = 20;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;

const clampScale = scale => {
    if (!Number.isFinite(scale) || scale <= 0) {
        return 1;
    }
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
};

const computeZoomSnapRadii = (scale, options = {}) => {
    const baseSnapRadius = typeof options.baseSnapRadius === 'number' ?
        options.baseSnapRadius :
        DEFAULT_SNAP_RADIUS;
    const baseConnectingRadius = typeof options.baseConnectingRadius === 'number' ?
        options.baseConnectingRadius :
        DEFAULT_CONNECTING_RADIUS;
    const basePreference = typeof options.basePreference === 'number' ?
        options.basePreference :
        DEFAULT_PREFERENCE;

    const clampedScale = clampScale(scale);
    let snapRadius;
    let connectingSnapRadius;
    let currentConnectionPreference;

    if (clampedScale < 1) {
        snapRadius = Math.round(baseSnapRadius / clampedScale);
        connectingSnapRadius = Math.round(baseConnectingRadius / clampedScale);
        currentConnectionPreference = Math.round(basePreference / clampedScale);
    } else if (clampedScale > 1) {
        const highFactor = 1 + ((clampedScale - 1) * 0.35);
        snapRadius = Math.round(baseSnapRadius / highFactor);
        connectingSnapRadius = Math.round(baseConnectingRadius / highFactor);
        currentConnectionPreference = basePreference;
    } else {
        snapRadius = baseSnapRadius;
        connectingSnapRadius = baseConnectingRadius;
        currentConnectionPreference = basePreference;
    }

    return {
        scale: clampedScale,
        snapRadius,
        connectingSnapRadius,
        currentConnectionPreference,
        screenSnapPx: Number((snapRadius * clampedScale).toFixed(2)),
        screenConnectingPx: Number((connectingSnapRadius * clampedScale).toFixed(2))
    };
};

const isSameStackInsertionJoint = (currentClosest, candidateClosest, markerBlock) => {
    if (!currentClosest || !candidateClosest) return false;
    if (currentClosest === candidateClosest) return true;
    if (currentClosest.targetConnection === candidateClosest ||
        candidateClosest.targetConnection === currentClosest) {
        return true;
    }
    if (!markerBlock) return false;
    const markerPrevTarget = markerBlock.previousConnection && markerBlock.previousConnection.targetConnection;
    const markerNextTarget = markerBlock.nextConnection && markerBlock.nextConnection.targetConnection;
    const touchesCurrent = currentClosest === markerPrevTarget || currentClosest === markerNextTarget ||
        (typeof currentClosest.targetBlock === 'function' && currentClosest.targetBlock() === markerBlock);
    const touchesCandidate = candidateClosest === markerPrevTarget || candidateClosest === markerNextTarget ||
        (typeof candidateClosest.targetBlock === 'function' && candidateClosest.targetBlock() === markerBlock);
    return Boolean(touchesCurrent && touchesCandidate);
};

const selectCandidateWithHysteresis = (currentState, candidate, options = {}) => {
    const snapRadius = typeof options.snapRadius === 'number' ? options.snapRadius : DEFAULT_SNAP_RADIUS;
    const connectingSnapRadius = typeof options.connectingSnapRadius === 'number' ?
        options.connectingSnapRadius :
        DEFAULT_CONNECTING_RADIUS;
    const preference = typeof options.currentConnectionPreference === 'number' ?
        options.currentConnectionPreference :
        DEFAULT_PREFERENCE;

    const hasCurrent = Boolean(currentState && currentState.closest && currentState.local);
    const hasCandidate = Boolean(
        candidate &&
        candidate.closest &&
        candidate.local &&
        Number.isFinite(candidate.radius)
    );

    if (!hasCurrent) {
        if (hasCandidate && candidate.radius <= snapRadius) {
            return {
                shouldUpdate: true,
                closest: candidate.closest,
                local: candidate.local,
                radius: candidate.radius
            };
        }
        return {
            shouldUpdate: false,
            closest: null,
            local: null,
            radius: Infinity
        };
    }

    const curDistance = Number.isFinite(currentState.curDistance) ? currentState.curDistance : Infinity;
    if (curDistance <= connectingSnapRadius) {
        if (!hasCandidate) {
            return {
                shouldUpdate: false,
                closest: currentState.closest,
                local: currentState.local,
                radius: curDistance
            };
        }
        if (candidate.closest === currentState.closest && candidate.local === currentState.local) {
            return {
                shouldUpdate: false,
                closest: currentState.closest,
                local: currentState.local,
                radius: curDistance
            };
        }
        if (currentState.isSameJoint ||
            isSameStackInsertionJoint(currentState.closest, candidate.closest, currentState.markerBlock)) {
            return {
                shouldUpdate: false,
                closest: currentState.closest,
                local: currentState.local,
                radius: curDistance
            };
        }
        const beatsCurrent = candidate.radius <= snapRadius &&
            (candidate.radius <= (curDistance - preference));
        if (beatsCurrent) {
            return {
                shouldUpdate: true,
                closest: candidate.closest,
                local: candidate.local,
                radius: candidate.radius
            };
        }
        return {
            shouldUpdate: false,
            closest: currentState.closest,
            local: currentState.local,
            radius: curDistance
        };
    }

    if (hasCandidate && candidate.radius <= snapRadius && candidate.closest !== currentState.closest) {
        return {
            shouldUpdate: true,
            closest: candidate.closest,
            local: candidate.local,
            radius: candidate.radius
        };
    }

    return {
        shouldUpdate: true,
        closest: null,
        local: null,
        radius: Infinity
    };
};

const getManagerCurrentDistance = (manager, dxy) => {
    if (!manager || !manager.localConnection_ || !manager.closestConnection_ || !dxy) {
        return Infinity;
    }
    const localX = manager.localConnection_.x_ + dxy.x;
    const localY = manager.localConnection_.y_ + dxy.y;
    const curDx = localX - manager.closestConnection_.x_;
    const curDy = localY - manager.closestConnection_.y_;
    const liveDist = Math.hypot(curDx, curDy);

    const origin = manager.sqPreviewOrigin_;
    if (origin && origin.conn === manager.closestConnection_) {
        const origDx = localX - origin.x;
        const origDy = localY - origin.y;
        const origDist = Math.hypot(origDx, origDy);
        return Math.min(liveDist, origDist);
    }
    return liveDist;
};

const patchSnapPolicy = SB => {
    if (!SB || !SB.InsertionMarkerManager || SB.InsertionMarkerManager.prototype.sqSnapPolicyPatched_) {
        return;
    }
    const mgrProto = SB.InsertionMarkerManager.prototype;
    mgrProto.sqSnapPolicyPatched_ = true;

    mgrProto.getZoomRadii_ = function () {
        const scale = (this.workspace_ && typeof this.workspace_.scale === 'number') ?
            this.workspace_.scale :
            1;
        return computeZoomSnapRadii(scale, {
            baseSnapRadius: SB.SNAP_RADIUS || DEFAULT_SNAP_RADIUS,
            baseConnectingRadius: SB.CONNECTING_SNAP_RADIUS || DEFAULT_CONNECTING_RADIUS,
            basePreference: SB.CURRENT_CONNECTION_PREFERENCE || DEFAULT_PREFERENCE
        });
    };

    mgrProto.getBaseSnapRadius_ = function () {
        return this.getZoomRadii_().snapRadius;
    };

    mgrProto.getStartRadius_ = function () {
        const radii = this.getZoomRadii_();
        if (this.closestConnection_ && this.localConnection_) {
            return radii.connectingSnapRadius;
        }
        return radii.snapRadius;
    };

    mgrProto.shouldUpdatePreviews_ = function (candidate, dxy) {
        const radii = this.getZoomRadii_();
        const curDistance = getManagerCurrentDistance(this, dxy);
        const markerBlock = this.markerConnection_ ? this.markerConnection_.sourceBlock_ : null;
        const decision = selectCandidateWithHysteresis(
            {
                closest: this.closestConnection_,
                local: this.localConnection_,
                curDistance,
                markerBlock
            },
            candidate,
            radii
        );
        if (decision.shouldUpdate && !decision.closest) {
            candidate.closest = null;
            candidate.local = null;
        }
        return decision.shouldUpdate;
    };
};

export {
    computeZoomSnapRadii,
    isSameStackInsertionJoint,
    selectCandidateWithHysteresis,
    patchSnapPolicy
};
