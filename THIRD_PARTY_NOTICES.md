# 来源与许可证

- 桌宠引擎：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，使用 npm 0.3.7，MIT 许可证保留在 [licenses/dsh-pet-MIT.txt](licenses/dsh-pet-MIT.txt)。安装时从 npm 获取；本项目的局部适配见 patch-runtime.mjs。
- 角色原包：[weit0529/gpt-pet](https://github.com/weit0529/gpt-pet)，提交 d6c30571a05bf7d542939ffdf50a10f0bbcfcd5f，MIT 许可证保留在 [assets/base/LICENSE](assets/base/LICENSE)。
- 新增动作、表情图使用内置 imagegen 生成，完整提示词见 prompts.json 与 emote-prompts.json。
- 离线补间使用 OpenCV；编码使用 FFmpeg 的 VP9-alpha 编码器。二者仅为本地构建依赖，不需要随运行环境安装。

本文件保留上游来源和许可证，不修改或覆盖各依赖原有的许可条款。
