# Auto Grade

基于`playwright`的同济大学Canvas系统自动化作业批改工具。支持自动批改简答题和文本文件上传类题目。

## Quick Start

1. 创建`.env`文件
2. 在`rubrius`目录下创建以`{assigmentID}.txt`为文件名的评分标准文件
3. 运行`npm run start`

## Usage

1. 使用同济大学统一身份认证系统登陆，请在`.env`文件中补充学号及登陆密码
2. 当前版本仅支持一次批改一个作业，多个作业可修改`assignmentID`多次运行
3. 评分标准文件支持`{maxPoints}`替换
4. 上传文件型作业仅支持可预览的文本文件，如`.txt`、`.md`、代码文件等，文件会下载至`downloads`文件夹

## Acknowledgement

- [playwright](https://playwright.dev/)
- [copilot](https://copilot.github.com/)


## Updates

当前版本支持批改group/single类型作业，支持统一批阅作业后从文件读取评分，再填写至canvas系统，使用前需构造评分JSON文件，包含评分和评语。

评语部分设置为满分时只设置'已评阅'，不设置额外评语。有扣分项时，填写JSON文件`comment`字段内容。single类型作业目前还不支持直接读取作业总分，需在`src/assignment-processor.ts#L138`中手动设置。