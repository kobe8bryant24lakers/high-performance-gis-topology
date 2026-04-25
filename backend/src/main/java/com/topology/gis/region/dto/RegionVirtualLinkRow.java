package com.topology.gis.region.dto;

import lombok.Data;

@Data
public class RegionVirtualLinkRow {
    private String sourceRegionId;
    private String targetRegionId;
    private Long count;
}
