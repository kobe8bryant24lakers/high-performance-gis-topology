<template>
  <header class="toolbar">
    <div class="toolbar-title">GIS Topology Viewer</div>
    <div class="toolbar-spacer" />
  </header>
</template>

<script setup lang="ts">
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: #181825;
  color: #cdd6f4;
  border-bottom: 1px solid #313244;
  z-index: 20;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
}

.toolbar-spacer {
  flex: 1;
}
</style>
