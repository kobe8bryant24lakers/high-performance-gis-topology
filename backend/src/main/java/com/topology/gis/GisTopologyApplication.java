package com.topology.gis;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.topology.gis.shared.mapper")
public class GisTopologyApplication {

    public static void main(String[] args) {
        SpringApplication.run(GisTopologyApplication.class, args);
    }
}
