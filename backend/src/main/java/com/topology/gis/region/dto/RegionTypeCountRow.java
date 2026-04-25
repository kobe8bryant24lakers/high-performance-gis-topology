package com.topology.gis.region.dto;

import lombok.Data;

@Data
public class RegionTypeCountRow {
    private String regionId;
    private String level;
    private String name;
    private String parentId;
    private Double centroidLng;
    private Double centroidLat;
    private Double bboxWest;
    private Double bboxSouth;
    private Double bboxEast;
    private Double bboxNorth;
    private String type;
    private Long count;
}
