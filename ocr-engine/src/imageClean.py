import cv2
import numpy as np
import sys
import os

def order_points(pts):
    """Orders coordinates as top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def four_point_transform(image, pts):
    """Flattens a skewed document into a top-down view."""
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    max_width = max(int(width_a), int(width_b))

    height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    max_height = max(int(height_a), int(height_b))

    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (max_width, max_height))

def detect_document(img):
    """Finds corners using edge detection and handles occlusions with convex hull."""
    ratio = img.shape[0] / 500.0
    img_small = cv2.resize(img, (int(img.shape[1] / ratio), 500))
        
    # 1. Convert to gray and blur to smooth out receipt text/noise
    gray = cv2.cvtColor(img_small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # 2. Edge Detection (Replaces the brittle 'picky' threshold)
    edged = cv2.Canny(blurred, 75, 200)

    # 3. Dilate and close the edges to connect any broken contour lines
    kernel = np.ones((5, 5), np.uint8)
    closing = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel)
    closing = cv2.dilate(closing, kernel, iterations=1)

    # (Optional) Save the edge map to see what OpenCV sees
    cv2.imwrite("debug_edges.png", closing)

    # 4. Find the contours from the edge map
    cnts, _ = cv2.findContours(closing, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not cnts:
        return None

    # Sort to find the largest contour
    cnts = sorted(cnts, key=cv2.contourArea, reverse=True)
    c = cnts[0]

    # If the largest object is too small, it's likely noise
    if cv2.contourArea(c) < (img_small.shape[0] * img_small.shape[1] * 0.1):
        return None

    # 5. Approximate the polygon
    peri = cv2.arcLength(c, True)
    approx = cv2.approxPolyDP(c, 0.02 * peri, True)

    # 6. The Fallback: If thumb/shadows break the 4 points, wrap it in a convex hull
    if len(approx) != 4:
        hull = cv2.convexHull(c)
        peri = cv2.arcLength(hull, True)
        for eps in np.linspace(0.01, 0.1, 10):
            approx = cv2.approxPolyDP(hull, eps * peri, True)
            if len(approx) == 4:
                break
    
    if len(approx) == 4:
        return approx.reshape(4, 2) * ratio
        
    return None

def clean_document(input_path, output_path):
    img = cv2.imread(input_path)
    if img is None:
        raise FileNotFoundError(f"Failed to load: {input_path}")

    # 1. Perspective Fix (The Crop)
    corners = detect_document(img)
    if corners is not None:
        warped = four_point_transform(img, corners)
        cv2.imwrite("debug_1_warped.png", warped)
    else:
        print("Warning: No document corners detected, skipping perspective correction.")
        warped = img # Fallback if no corners detected
        cv2.imwrite("debug_1_warped_fallback.png", warped)

    # 2. Grayscale & Upscale
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    cv2.imwrite("debug_2_gray.png", gray)
    height, width = gray.shape
    gray_up = cv2.resize(gray, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite("debug_3_gray_up.png", gray_up)

    # 3. Bilateral Filter (Smooths paper grain)
    denoised = cv2.bilateralFilter(gray_up, 9, 75, 75)
    cv2.imwrite("debug_4_denoised.png", denoised)

    # 4. Adaptive Thresholding (Lowered C constant from 15 to 10)
    binary = cv2.adaptiveThreshold(
        denoised, 175, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10
    )
    cv2.imwrite("debug_5_binary.png", binary)

    # 5. Stroke Healing (Bolding)
    kernel = np.ones((2, 2), np.uint8)
    thickened = cv2.erode(binary, kernel, iterations=1)
    cv2.imwrite("debug_6_thickened.png", thickened)

    # 6. Connected Components (Lowered area requirement from 50 to 12)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        255 - thickened, connectivity=8
    )
    cleaned = np.ones_like(thickened) * 255
    for i in range(1, num_labels):
        # Keep components larger than 12 pixels
        if stats[i, cv2.CC_STAT_AREA] > 12: 
            cleaned[labels == i] = 0
    cv2.imwrite("debug_7_cleaned.png", cleaned)

    # 7. Final Padding for Tesseract
    final = cv2.copyMakeBorder(
        cleaned, 80, 80, 80, 80, cv2.BORDER_CONSTANT, value=255
    )
    cv2.imwrite("debug_8_final.png", final)

    cv2.imwrite(output_path, final)

if __name__ == "__main__" and len(sys.argv) >= 3:
        print(f"Cleaning document: {sys.argv[1]} -> {sys.argv[2]}")
        clean_document(sys.argv[1], sys.argv[2])