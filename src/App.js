import React, { useState, useEffect, useRef, useCallback } from "react";
// Removed @react-google-maps/api import as it's not directly supported in this environment
// Removed xlsx import as it will be loaded via CDN

// Define the container style for the Google Map
const containerStyle = {
  width: "100%",
  height: "600px", // Increased height for better visibility
  borderRadius: "0.75rem" /* rounded-xl */,
  boxShadow:
    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" /* shadow-xl */,
};

// Default center for the map (e.g., a central location)
const defaultCenter = {
  lat: -28.0, // Example: Southern Africa
  lng: 25.0,
};

// Main App component
const App = () => {
  // State variables
  const [excelData, setExcelData] = useState([]);
  const [currentStoreIndex, setCurrentStoreIndex] = useState(0); // Index of the store currently being viewed
  const [updatedStores, setUpdatedStores] = useState([]); // Array of updated store objects
  const [redMarkerPosition, setRedMarkerPosition] = useState(null); // Position of the unmovable red marker
  const [greenMarkerPosition, setGreenMarkerPosition] = useState(null); // Position of the draggable green marker
  const [isGreenMarkerMoved, setIsGreenMarkerMoved] = useState(false); // Flag to show/hide save button
  const [map, setMap] = useState(null); // Google Map instance
  const [address, setAddress] = useState("");
  const geocoderRef = useRef(null); // To hold Google Maps Geocoder instance
  const redMarkerRef = useRef(null); // Ref for the Google Maps Red Marker instance
  const greenMarkerRef = useRef(null); // Ref for the Google Maps Green Marker instance
  const [message, setMessage] = useState(""); // User feedback messages
  const mapRef = useRef(null); // Ref for the map DOM element
  const isMapScriptLoaded = useRef(false); // To track if Google Maps script is loaded

  // Load updated stores from localStorage on component mount
  useEffect(() => {
    try {
      const storedUpdates = localStorage.getItem("updatedStores");
      if (storedUpdates) {
        setUpdatedStores(JSON.parse(storedUpdates));
        setMessage("Loaded previous updates from local storage.");
      }
    } catch (error) {
      console.error("Failed to load from local storage:", error);
      setMessage("Error loading data from local storage.");
    }
  }, []);

  // Save updated stores to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("updatedStores", JSON.stringify(updatedStores));
    } catch (error) {
      console.error("Failed to save to local storage:", error);
      setMessage("Error saving data to local storage.");
    }
  }, [updatedStores]);

  // Function to initialize the Google Map
  const initMap = useCallback(() => {
    if (window.google && window.google.maps && mapRef.current && !map) {
      const newMap = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 10,
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      });

      setMap(newMap);
      setMessage("Google Map loaded.");
      geocoderRef.current = new window.google.maps.Geocoder();
    } else if (!window.google || !window.google.maps) {
      setMessage("Google Maps script not yet loaded. Please wait...");
      setTimeout(initMap, 500);
    }
  }, [map]);
  // Effect to load Google Maps and XLSX scripts
  useEffect(() => {
    // Load Google Maps script
    if (
      !document.getElementById("google-map-script") &&
      !isMapScriptLoaded.current
    ) {
      let apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      const script = document.createElement("script");
      script.id = "google-map-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        isMapScriptLoaded.current = true; // Mark script as loaded
        initMap(); // Initialize map once script is loaded
      };
      script.onerror = () =>
        setMessage("Error loading Google Maps script. Check API key.");
      document.head.appendChild(script);
    } else if (isMapScriptLoaded.current && !map) {
      // If script is already loaded but map not initialized (e.g., component re-mount)
      initMap();
    }

    // Load XLSX script
    if (!document.getElementById("xlsx-script")) {
      const script = document.createElement("script");
      script.id = "xlsx-script";
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.async = true;
      script.defer = true;
      script.onload = () =>
        setMessage((prev) => prev + " XLSX library loaded.");
      script.onerror = () => setMessage("Error loading XLSX library.");
      document.head.appendChild(script);
    }
  }, [initMap, map]); // Depend on initMap and map state

  // Effect to initialize markers once the map is loaded
  useEffect(() => {
    if (map && window.google && window.google.maps) {
      // Initialize red marker
      if (!redMarkerRef.current) {
        redMarkerRef.current = new window.google.maps.Marker({
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "red",
            fillOpacity: 0.9,
            strokeWeight: 0,
            scale: 10,
          },
          title: "Original Location (Unmovable)",
          draggable: false,
        });
      }

      // Initialize green marker
      if (!greenMarkerRef.current) {
        const newGreenMarker = new window.google.maps.Marker({
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "green",
            fillOpacity: 0.9,
            strokeWeight: 0,
            scale: 10,
          },
          title: "Drag to New Location",
          draggable: true,
        });
        newGreenMarker.addListener("dragend", (event) => {
          const newLat = event.latLng.lat();
          const newLng = event.latLng.lng();
          setGreenMarkerPosition({ lat: newLat, lng: newLng });
          setIsGreenMarkerMoved(true); // Enable save button
          setMessage("Green marker moved. Click Save to confirm new location.");
        });
        greenMarkerRef.current = newGreenMarker;
      }
    }

    // Cleanup function for markers when map unmounts or component unmounts
    return () => {
      if (redMarkerRef.current) {
        redMarkerRef.current.setMap(null);
        redMarkerRef.current = null;
      }
      if (greenMarkerRef.current) {
        greenMarkerRef.current.setMap(null);
        greenMarkerRef.current = null;
      }
    };
  }, [map]); // This effect runs only when 'map' changes (i.e., when map is initialized)

  // Effect to update marker positions based on current store data
  useEffect(() => {
    // Only proceed if map and markers are initialized
    if (!map || !redMarkerRef.current || !greenMarkerRef.current) {
      return;
    }

    if (excelData.length > 0 && currentStoreIndex < excelData.length) {
      const currentStore = excelData[currentStoreIndex];
      const lat = parseFloat(currentStore.Latitude);
      const lng = parseFloat(currentStore.Longitude);
      setAddress(currentStore.StoreName);

      if (!isNaN(lat) && !isNaN(lng)) {
        const position = { lat, lng };

        // Set positions and ensure markers are visible on the map
        redMarkerRef.current.setPosition(position);
        redMarkerRef.current.setMap(map); // Ensure it's on the map
        greenMarkerRef.current.setPosition(position);
        greenMarkerRef.current.setMap(map); // Ensure it's on the map

        setRedMarkerPosition(position);
        setGreenMarkerPosition(position);
        setIsGreenMarkerMoved(false); // Reset flag for new store
        setMessage(`Viewing store: ${currentStore.StoreName}`);

        map.panTo(position);
        map.setZoom(12);
      } else {
        setMessage(
          `Invalid coordinates for store: ${currentStore.StoreName}. Skipping.`
        );
        // Optionally, automatically move to the next store if coordinates are invalid
        // handleSaveAndNext(); // This would cause an infinite loop if not handled carefully
      }
    } else {
      // If no excel data, or all stores processed, hide markers
      if (redMarkerRef.current) redMarkerRef.current.setMap(null);
      if (greenMarkerRef.current) greenMarkerRef.current.setMap(null);
      setRedMarkerPosition(null);
      setGreenMarkerPosition(null);
      if (excelData.length > 0 && currentStoreIndex >= excelData.length) {
        setMessage("All stores processed!");
      }
    }
  }, [currentStoreIndex, excelData, map]); // Depend on currentStoreIndex, excelData, and map

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setMessage("Reading Excel file...");
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (!window.XLSX) {
            setMessage("XLSX library not loaded. Please wait or refresh.");
            return;
          }
          const data = new Uint8Array(e.target.result);

          const workbook = window.XLSX.read(data, { type: "array" });

          const sheetName = workbook.SheetNames[0]; // Get the first sheet
          const worksheet = workbook.Sheets[sheetName];
          const json = window.XLSX.utils.sheet_to_json(worksheet);

          // Validate required columns
          const requiredColumns = [
            "StoreName",
            "Province",
            "Latitude",
            "Longitude",
          ];
          const missingColumns = requiredColumns.filter(
            (col) => !json[0] || !(col in json[0])
          );

          if (missingColumns.length > 0) {
            setMessage(
              `Error: Missing required columns in Excel file: ${missingColumns.join(
                ", "
              )}. Please ensure your Excel has 'StoreName', 'Province', 'Latitude', and 'Longitude' columns.`
            );
            setExcelData([]);
            setCurrentStoreIndex(0);
            return;
          }

          setExcelData(json);
          setCurrentStoreIndex(0); // Start from the first store
          setMessage(
            `Excel file "${file.name}" loaded successfully with ${json.length} stores.`
          );
        } catch (error) {
          console.error("Error reading Excel file:", error);
          setMessage(
            "Error processing Excel file. Please ensure it is a valid .xlsx file."
          );
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Handle saving the current store's updated coordinates
  const handleSaveAndNext = () => {
    if (!redMarkerPosition || !greenMarkerPosition || excelData.length === 0) {
      setMessage("No store data to save or markers not set.");
      return;
    }

    const currentStore = excelData[currentStoreIndex];
    const oldLat = redMarkerPosition.lat;
    const oldLng = redMarkerPosition.lng;
    const newLat = greenMarkerPosition.lat;
    const newLng = greenMarkerPosition.lng;

    // Create the updated store object
    const updatedStore = {
      StoreName: currentStore.StoreName,
      Province: currentStore.Province,
      OldLatitude: oldLat,
      OldLongitude: oldLng,
      Latitude: newLat, // New latitude
      Longitude: newLng, // New longitude
    };

    // Add to updatedStores, ensuring no duplicates for the same store name
    setUpdatedStores((prevUpdates) => {
      const existingIndex = prevUpdates.findIndex(
        (s) => s.StoreName === updatedStore.StoreName
      );
      if (existingIndex > -1) {
        // Update existing entry
        const newUpdates = [...prevUpdates];
        newUpdates[existingIndex] = updatedStore;
        return newUpdates;
      } else {
        // Add new entry
        return [...prevUpdates, updatedStore];
      }
    });

    setMessage(
      `Saved new coordinates for ${currentStore.StoreName}. Moving to next store.`
    );
    setIsGreenMarkerMoved(false); // Hide save button
    setCurrentStoreIndex((prevIndex) => prevIndex + 1); // Move to next store
  };

  // Handle downloading the updated Excel file
  const handleDownloadExcel = () => {
    if (excelData.length === 0) {
      setMessage("No original Excel data loaded to download.");
      return;
    }
    if (updatedStores.length === 0) {
      setMessage("No stores have been updated yet to download.");
      return;
    }
    if (!window.XLSX) {
      setMessage(
        "XLSX library not loaded. Cannot download. Please wait or refresh."
      );
      return;
    }

    // Create a copy of the original data to modify
    const dataToExport = excelData.map((originalStore) => {
      // Find if this store was updated
      const updated = updatedStores.find(
        (us) => us.StoreName === originalStore.StoreName
      );
      if (updated) {
        // Return a new object with updated Latitude and Longitude
        return {
          ...originalStore,
          Latitude: updated.Latitude,
          Longitude: updated.Longitude,
        };
      }
      return originalStore; // Return original if not updated
    });

    const worksheet = window.XLSX.utils.json_to_sheet(dataToExport);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Updated Stores");
    window.XLSX.writeFile(workbook, "updated_stores.xlsx");
    setMessage("Updated Excel file downloaded successfully!");
  };

  const handleSearchAddress = () => {
    if (!geocoderRef.current || !address) {
      setMessage("Please enter a valid address.");
      return;
    }

    geocoderRef.current.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        const newPos = {
          lat: location.lat(),
          lng: location.lng(),
        };

        map.setCenter(newPos);
        map.setZoom(15);

        // Move the green marker to the new position
        if (greenMarkerRef.current) {
          greenMarkerRef.current.setPosition(newPos);
          setGreenMarkerPosition(newPos);
          setIsGreenMarkerMoved(true);
        }

        setMessage(`Location found: ${results[0].formatted_address}`);
      } else {
        setMessage("Address not found. Please try a different search.");
      }
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: "linear-gradient(to bottom right, #eff6ff, #e0e7ff)",
        padding: "2rem",
        fontFamily: "Inter, sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        color: "#374151",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "2rem",
          borderRadius: "1rem",
          boxShadow:
            "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
          maxWidth: "48rem",
          width: "100%",
          marginBottom: "2rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <h1
          style={{
            fontSize: "2.25rem",
            fontWeight: "800",
            textAlign: "center",
            color: "#4338ca",
            marginBottom: "1.5rem",
          }}
        >
          Store Location Updater
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "#4b5563",
            marginBottom: "2rem",
          }}
        >
          Upload your Excel file, adjust store locations, and download the
          updated data.
        </p>

        {/* File Upload Section */}
        <div
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <label
            htmlFor="excel-upload"
            style={{
              display: "block",
              fontSize: "1.125rem",
              fontWeight: "600",
              color: "#374151",
              marginBottom: "0.75rem",
            }}
          >
            Upload Excel Document (.xlsx)
          </label>
          <input
            id="excel-upload"
            type="file"
            accept=".xlsx"
            onChange={handleFileUpload}
            style={{
              display: "block",
              width: "100%",
              fontSize: "0.875rem",
              color: "#6b7280",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Message Display */}
        {message && (
          <div
            style={{
              backgroundColor: "#dbeafe",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              paddingTop: "0.75rem",
              paddingBottom: "0.75rem",
              borderRadius: "0.5rem",
              position: "relative",
              marginBottom: "1.5rem",
              textAlign: "center",
              fontSize: "0.875rem",
            }}
          >
            {message}
          </div>
        )}

        {/* Current Store Info */}
        {excelData.length > 0 && currentStoreIndex < excelData.length && (
          <div
            style={{
              backgroundColor: "#eef2ff",
              padding: "1.5rem",
              borderRadius: "0.75rem",
              boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
              marginBottom: "1.5rem",
              border: "1px solid #c7d2fe",
            }}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "700",
                color: "#312e81",
                marginBottom: "0.75rem",
              }}
            >
              Current Store: {excelData[currentStoreIndex]?.StoreName}
            </h2>
            <p style={{ color: "#374151", fontSize: "1.125rem" }}>
              Province:{" "}
              <span style={{ fontWeight: "600" }}>
                {excelData[currentStoreIndex]?.Province}
              </span>
            </p>
            <p style={{ color: "#374151", fontSize: "1.125rem" }}>
              Original Coordinates:{" "}
              <span style={{ fontWeight: "600" }}>
                {excelData[currentStoreIndex]?.Latitude},{" "}
                {excelData[currentStoreIndex]?.Longitude}
              </span>
            </p>
            {greenMarkerPosition && (
              <p style={{ color: "#374151", fontSize: "1.125rem" }}>
                Current Green Marker Coordinates:{" "}
                <span style={{ fontWeight: "600" }}>
                  {greenMarkerPosition.lat.toFixed(6)},{" "}
                  {greenMarkerPosition.lng.toFixed(6)}
                </span>
              </p>
            )}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.5rem",
          }}
        >
          <input
            type="text"
            placeholder="Enter address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "1px solid #d1d5db",
              width: "70%",
              fontSize: "1rem",
            }}
          />
          <button
            onClick={handleSearchAddress}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              fontWeight: "600",
              border: "none",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>
        <div
          ref={mapRef}
          style={{
            ...containerStyle,
            minHeight: "300px",
            border: "1px solid #e5e7eb",
          }}
        />

        {/* Action Buttons */}
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            justifyContent: "center",
            gap: "1rem", // Replaced space-x-4 with gap
          }}
        >
          {isGreenMarkerMoved && (
            <button
              onClick={handleSaveAndNext}
              style={{
                paddingLeft: "2rem",
                paddingRight: "2rem",
                paddingTop: "0.75rem",
                paddingBottom: "0.75rem",
                backgroundColor: "#059669",
                color: "#ffffff",
                fontWeight: "700",
                borderRadius: "9999px",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                transitionProperty: "all",
                transitionDuration: "300ms",
                transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                transform: "scale(1)",
                outline: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#047857")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#059669")
              }
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 0 0 4px rgba(52, 211, 153, 0.5)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)")
              }
            >
              Save & Next Store
            </button>
          )}

          {excelData.length > 0 &&
            currentStoreIndex < excelData.length &&
            !isGreenMarkerMoved && (
              <button
                onClick={() => setCurrentStoreIndex((prev) => prev + 1)}
                style={{
                  paddingLeft: "2rem",
                  paddingRight: "2rem",
                  paddingTop: "0.75rem",
                  paddingBottom: "0.75rem",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "700",
                  borderRadius: "9999px",
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  transitionProperty: "all",
                  transitionDuration: "300ms",
                  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: "scale(1)",
                  outline: "none",
                  border: "none",
                  cursor: "pointer",
                  opacity: currentStoreIndex >= excelData.length - 1 ? 0.5 : 1, // disabled styling
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#1d4ed8")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2563eb")
                }
                onFocus={(e) =>
                  (e.currentTarget.style.boxShadow =
                    "0 0 0 4px rgba(96, 165, 250, 0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.boxShadow =
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)")
                }
                disabled={currentStoreIndex >= excelData.length - 1}
              >
                Skip & Next Store
              </button>
            )}

          {updatedStores.length > 0 && (
            <button
              onClick={handleDownloadExcel}
              style={{
                paddingLeft: "2rem",
                paddingRight: "2rem",
                paddingTop: "0.75rem",
                paddingBottom: "0.75rem",
                backgroundColor: "#7c3aed",
                color: "#ffffff",
                fontWeight: "700",
                borderRadius: "9999px",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                transitionProperty: "all",
                transitionDuration: "300ms",
                transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                transform: "scale(1)",
                outline: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#6d28d9")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#7c3aed")
              }
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 0 0 4px rgba(167, 139, 250, 0.5)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.boxShadow =
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)")
              }
            >
              Download Updated Excel
            </button>
          )}
        </div>

        {/* Summary of Updated Stores (Optional) */}
        {updatedStores.length > 0 && (
          <div
            style={{
              marginTop: "2.5rem",
              backgroundColor: "#f9fafb",
              padding: "1.5rem",
              borderRadius: "0.75rem",
              boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
              border: "1px solid #e5e7eb",
            }}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: "700",
                color: "#374151",
                marginBottom: "1rem",
                textAlign: "center",
              }}
            >
              Updated Stores Summary ({updatedStores.length})
            </h3>
            <div style={{ maxHeight: "15rem", overflowY: "auto" }}>
              <ul
                style={{
                  listStyleType: "disc",
                  listStylePosition: "inside",
                  lineHeight: "1.5",
                }}
              >
                {updatedStores.map((store, index) => (
                  <li
                    key={index}
                    style={{
                      color: "#374151",
                      fontSize: "1rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>{store.StoreName}</span>{" "}
                    (Province: {store.Province}): Old: (
                    {store.OldLatitude.toFixed(6)},{" "}
                    {store.OldLongitude.toFixed(6)}) {"->"} New: (
                    {store.Latitude.toFixed(6)}, {store.Longitude.toFixed(6)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
