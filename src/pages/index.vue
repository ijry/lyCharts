<template>
	<view class="wrap">
		<page-nav :desc="desc"></page-nav>
		<view class="list-wrap">
			<up-cell-group title-bg-color="rgb(243, 244, 246)" :title="item.groupName" v-for="(item, index) in list" :key="index">
				<up-cell :titleStyle="{fontWeight: 500}" :title="item1.title"
				 v-for="(item1, index1) in item.list" :key="index1" isLink @click="openPage" :name="item1.path">
					<template v-slot:icon>
						<image
							class="u-cell-icon"
							:src="getIcon(item1.icon)"
							mode="widthFix">
						</image>
					</template>
				</up-cell>
			</up-cell-group>
		</view>
        <up-gap height="30" bgColor="#fff"></up-gap>
        <up-alert description ='零云®lyCharts 2025-2099'></up-alert>
		<up-gap height="30" bgColor="#fff"></up-gap>
	</view>
</template>

<script lang="ts">
	import list from "./index.config.js";
	export default {
		data() {
			return {
				list: list,
				desc: '零云®lyCharts是全面兼容nvue/鸿蒙/uni-app-x(即将发布)的uni-app生态新一代图表组件，API兼容ECharts，但体积更小，减少学习开发成本，提升开发效率。',
			}
		},
		computed: {
		},
        onLoad() {
        },
		methods: {
			getIcon(path: string) {
				return 'https://uiadmin.net/lyCharts/h5/static/lycharts/demo/' + path + '.png';
			},
			openPage(detail: { name: string }) {
				const path = detail.name
				uni.navigateTo({
					url: path
				})
			},
		}
	}
</script>

<style>
	/* page {
		background-color: rgb(240, 242, 244);
	} */
</style>

<style lang="scss" >
	
	.u-cell-icon {
		width: 36rpx;
		height: 36rpx;
		margin-right: 8rpx;
	}
	
	.u-cell-group__title__text {
		font-weight: bold;
	}
</style>
