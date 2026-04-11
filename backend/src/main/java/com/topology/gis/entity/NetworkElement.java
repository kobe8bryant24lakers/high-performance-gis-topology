package com.topology.gis.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.topology.gis.typehandler.JsonbTypeHandler;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
@TableName(value = "network_elements", autoResultMap = true)
public class NetworkElement {

    @TableId(type = IdType.INPUT)
    private String id;

    private String type;

    private String label;

    private Double lng;

    private Double lat;

    private Integer version;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;

    @TableField(typeHandler = JsonbTypeHandler.class)
    private Map<String, Object> properties;
}
