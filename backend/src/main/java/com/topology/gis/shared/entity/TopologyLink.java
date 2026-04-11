package com.topology.gis.shared.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.topology.gis.shared.typehandler.JsonbTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
@TableName(value = "topology_links", autoResultMap = true)
public class TopologyLink {

    @TableId(type = IdType.INPUT)
    private String id;

    private String type;

    @TableField("source_id")
    private String sourceId;

    @TableField("target_id")
    private String targetId;

    private Boolean directed;

    private Double weight;

    private String status;

    private Integer version;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;

    @TableField(typeHandler = JsonbTypeHandler.class)
    private Map<String, Object> properties;
}
