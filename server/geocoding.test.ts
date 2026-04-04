import { describe, it, expect } from "vitest";

// Validate that GOOGLE_MAPS_API_KEY is set and the Geocoding API responds correctly
// Uses a known coordinate (Peepul Farm area, Haryana, India) as a sanity check
describe("Google Geocoding API", () => {
  it("should reverse geocode a coordinate and return a non-empty area name", async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    expect(apiKey, "GOOGLE_MAPS_API_KEY must be set").toBeTruthy();

    // NH154 near Banuri, Haryana — a known field location
    const lat = 29.1;
    const lng = 76.5;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&result_type=route|sublocality|locality`;

    const res = await fetch(url);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.status).toBe("OK");
    expect(data.results.length).toBeGreaterThan(0);

    const components = data.results[0].address_components as Array<{ long_name: string; types: string[] }>;
    const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? "";
    const road = get("route") || get("sublocality_level_1") || get("sublocality");
    const locality = get("locality") || get("administrative_area_level_3") || get("administrative_area_level_2");
    const parts = [road, locality].filter(Boolean);
    const areaName = parts.join(", ") || data.results[0].formatted_address;

    console.log("Resolved area name:", areaName);
    expect(areaName.length).toBeGreaterThan(0);
  }, 15000);
});
