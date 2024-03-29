// created basically by chatGPT
const CAMERA_DISTANCE_TO_PLANE_INCHES = 20; // Replace this with the actual distance in inches
const MIN_LINE_LENGTH_INCHES = 0.5;
const CAMERA_HORIZONTAL_FOV_DEGREES = 60; // You should replace this value with your camera's actual horizontal field of view in degrees

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let cap;

function initialize() {
    if (typeof cv === 'undefined') {
        setTimeout(initialize, 50);
        return;
    }

    cv.onRuntimeInitialized = function () {
        startCamera();
    };
}

function startCamera() {
    navigator.mediaDevices.getUserMedia({video: true, audio: false})
        .then(function (stream) {
            video.srcObject = stream;
            video.play();
            cap = new cv.VideoCapture(video);
            setTimeout(processFrame, 50, recognizeShapes);
        })
        .catch(function (err) {
            console.error("An error occurred: " + err);
        });
}

function processFrame(fn) {
    let input = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap.read(input);
    let output = new cv.Mat();

    fn(input, output);

    input.delete();
    output.delete();
    setTimeout(processFrame, 100, fn);
}

function segmentBgFg(input, output) {
    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(input, gray, cv.COLOR_RGBA2GRAY);

    // Apply adaptive thresholding to segment the image
    // cv.adaptiveThreshold(gray, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 25, 10);
    const thresh = new cv.Mat();
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY_INV);

    // Find the contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Draw the contours on the original image
    const color = new cv.Scalar(255, 255, 255); // Red color for contours
    const thickness = 2; // Thickness of contour lines
    const dst = cv.Mat.zeros(input.rows, input.cols, cv.CV_8UC3); // Output image
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let epsilon = 0.1 * cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilon, true);
        let vertices = approx.rows;
        if (vertices < 3) continue;

        console.log('area:', cv.contourArea(contour), 'vertices:', vertices, 'is convex:', cv.isContourConvex(contour));
        // if (!cv.isContourConvex(contour)) continue;
        cv.drawContours(dst, contours, i, color, thickness, cv.LINE_8, hierarchy, 0);
    }

    // Display the thresholded image
    cv.imshow('canvas', dst);

    // Release the memory
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
    dst.delete();
}

function recognizeShapes(input, output) {
    let src = input;
    let gray = new cv.Mat();
    let contours = window.contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    const scaleFactor = 0.5;
    const dsize = new cv.Size(src.cols * scaleFactor, src.rows * scaleFactor);
    cv.resize(src, src, dsize, 0, 0, cv.INTER_AREA);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, gray, 50, 100, 3, false);
    cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        // if (!cv.isContourConvex(contour)) continue;
        let area = cv.contourArea(contour);
        if (area < 100) continue;
        console.log('area ' + area);
        if (area < 800) continue;
        // if (contourLengthInInches(contour) < MIN_LINE_LENGTH_INCHES) {
        //     continue;
        // }

        let epsilon = 0.02 * cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilon, true);

        let vertices = approx.rows;
        let color = new cv.Scalar(0, 0, 255);

        // // Skip the contour if the color variance is too high
        // const MAX_COLOR_VARIANCE = 100; // Adjust this value based on your requirements
        // if (colorVariance(src, contour) > MAX_COLOR_VARIANCE) {
        //     approx.delete();
        //     continue;
        // }

        if (vertices === 3) {
            console.log("Triangle detected");
        } else if (vertices === 4) {
            let rect = cv.boundingRect(approx);
            let aspectRatio = rect.width / rect.height;
            if (aspectRatio > 0.95 && aspectRatio < 1.05) {
                console.log("Square detected");
            } else {
                console.log("Rectangle detected");
            }
        } else if (vertices === 5) {
            console.log("Trapezium detected");
        } else if (vertices === 6) {
            console.log("Regular hexagon detected");
        } else if (vertices === 8) {
            console.log("Parallelogram detected");
        }

        cv.drawContours(src, contours, i, color, 2, cv.LINE_8, hierarchy, 0);
        approx.delete();
    }

    cv.imshow('canvas', src);
    if (window.stopNow) debugger;

    gray.delete();
    contours.delete();
    hierarchy.delete();
}

function contourLengthInInches(contour) {
    let contourLengthPixels = cv.arcLength(contour, true);
    let horizontalFovRadians = (CAMERA_HORIZONTAL_FOV_DEGREES * Math.PI) / 180;
    let horizontalFovInches = 2 * CAMERA_DISTANCE_TO_PLANE_INCHES * Math.tan(horizontalFovRadians / 2);
    let inchesPerPixel = horizontalFovInches / video.width;

    return contourLengthPixels * inchesPerPixel;
}

function colorVariance(src, contour) {
    let colorSum = [0, 0, 0];
    let colorCount = 0;

    let points = [];
    for (let i = 0; i < contour.rows; ++i) {
        points.push({x: contour.data32S[i * 2], y: contour.data32S[i * 2 + 1]});
    }

    for (let y = 0; y < src.rows; ++y) {
        for (let x = 0; x < src.cols; ++x) {
            if (cv.pointPolygonTest(contour, new cv.Point(x, y), false) >= 0) {
                const idx = (y * src.cols + x) * src.channels();
                const color = [src.data[idx], src.data[idx + 1], src.data[idx + 2]];

                colorSum[0] += color[0];
                colorSum[1] += color[1];
                colorSum[2] += color[2];
                colorCount++;
            }
        }
    }

    let meanColor = [
        colorSum[0] / colorCount,
        colorSum[1] / colorCount,
        colorSum[2] / colorCount,
    ];

    let colorVarianceSum = 0;
    points.forEach((point) => {
        const idx = (point.y * src.cols + point.x) * src.channels();
        const color = [src.data[idx], src.data[idx + 1], src.data[idx + 2]];

        const diffR = color[0] - meanColor[0];
        const diffG = color[1] - meanColor[1];
        const diffB = color[2] - meanColor[2];

        colorVarianceSum += diffR ** 2 + diffG ** 2 + diffB ** 2;
    });

    let variance = colorVarianceSum / colorCount;
    return variance;
}
