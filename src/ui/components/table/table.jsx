import React from 'react'
import Icon from '../icon'
import Row from './row'
import PropTypes from 'prop-types'
import {
    CHECK_TYPE
} from './const-data'
import cn from '../class-name'


const ASC = 'ASC'  //正序
const DESC = 'DESC' //反序

// 滚动条宽度
const SCROLL_BAR_WIDTH = (function () {
    const div = document.createElement('div')
    div.setAttribute('style', 'overflow:scroll;width: 100px;height:1px;visibility:hidden;position:fixed;z-index:-99;')
    div.innerHTML = `<div style="height:10px"></div>`
    document.body.appendChild(div)
    const barWidth = div.offsetWidth - div.clientWidth
    document.body.removeChild(div)
    return barWidth
})()

class Table extends React.Component {
    constructor(props) {
        super(props)

        this.state = {
            complete: false,
            signOffset: 0,  // 调整表格列宽时, 指示器样式
            leftShadow: false,  // 阴影
            rightShadow: true,
            topShadow: false,
            syncData: { check: {} },
            checkStatus: -1,  // -1 全不选中  0 部分  1全选
            fixedBottomHeight: 0,
            sortMap: { current: '', order: ASC } // 表格排序, current 为当前行的prop. order  ASC正序 DESC 反序
        }

        this.plainTableBodyTrackEl = { current: null }
        this.containerEl = { current: null }
        this.plainTableHeadTrackEl = { current: null }
        this.leftTableTbodyEl = { current: null }
        this.rightTableTbodyEl = { current: null }

        this.tableWidth = { plain: '100%', left: 0, right: 0, total: 0 }
        this.checkedList = []       // 多选或单选表格， 选中的表格行
        this.checkState = CHECK_TYPE.NONE  // 当前表格的类型  带有单选 | 有多选功能  | 无

        this.scrollBarY = 0
        this.scrollBarX = 0


        // 根据colums数据， 进行预处理
        this.initialize(props)

        this.onRowMount = this.onRowMount.bind(this)
        // this.moveSign = this.moveSign.bind(this)
        // this.resizeCol = this.resizeCol.bind(this)
        // this.checkedRow = this.checkedRow.bind(this)
        this.syncScroll = this.syncScroll.bind(this)
        // this.checkedAll = this.checkedAll.bind(this)
        // this.fixedBottomHeight = this.fixedBottomHeight.bind(this)
        this.resize = this.resize.bind(this)

    }

    /**
    * 数据预处理
    *
    * */
    initialize(props) {
        const propsColumns = [...props.columns]
        const columns = {
            left: [],
            plain: [],
            right: [],
            all: []
        }
        let tableType = null
        let col = null
        let type = null
        let isCheckbox = false
        let isRadio = false
        let minWidth = 0
        for (let i = 0, len = propsColumns.length; i < len; i++) {
            col = Object.assign({}, propsColumns[i])  // 拷贝
            type = col.type
            isCheckbox = type === 'checkbox'
            isRadio = type === 'radio'

            // 记录原始位置
            col.__i__ = i

            // 最小缩放宽度
            minWidth = col.width || ((isCheckbox || isRadio || type === 'expand' || type === 'index') ? 50 : 0);
            col.minWidth = minWidth         // 最小允许宽度
            col.maxWidthInCol = minWidth    // 一列中最大宽度
            col.firstRenderWidth = minWidth // 首次渲染后 ， 一列中最大宽度

            // 如果 设置type 或 width 则 禁止展宽
            if (type || col.width || col.fixed) {
                col.cannotExpand = true
            }



            // 根据fixed 属性， 分配

            switch (col.fixed) {
                case 'left':
                    columns.left.push(col)
                    break
                case 'right':
                    columns.right.push(col)
                    break
                default:
                    columns.plain.push(col)
                    break
            }

            columns.all.push(col)

            // 定义表格的类型
            if (!tableType) {
                tableType = isCheckbox ? CHECK_TYPE.CHECKBOX : (isRadio ? CHECK_TYPE.RADIO : CHECK_TYPE.NONE)
            }

        }


        this.columns = columns
        this.checkState = tableType

        this.HAS_LEFT = columns.left.length > 0
        this.HAS_RIGHT = columns.right.length > 0

        this.HAS_FIXED = this.HAS_LEFT || this.HAS_RIGHT

        /* 暂时， 是否willMount时确定，以后不可更改 */
        // 使用平铺布局
        this.USE_TILE_LAYOUT = (this.HAS_FIXED || props.type === 'tile')
        //使用分体式布局
        this.USE_SPLIT_LAYOUT = !!props.tableHeight

        // 首次渲染完成
        if (this.state.complete) return
        // 第一次渲染有无数据
        this.hasNoDataWhenInit = props.rows.length === 0
    }
    /**
     * 初次渲染完成后，开始计算布局
     */
    componentDidMount() {

        this._initStructure()

        // 首次渲染完成
        setTimeout(() => { this.setState({ complete: true }) })

        window.addEventListener('resize', this.resize)
    }

    UNSAFE_componentWillReceiveProps(nextP) {
        // 更新了 rows数据后
        if (nextP.rows !== this.props.rows) {
            // 将所有 checkbox状态清空
            this.checkedList = []

            this.setState({
                syncData: { check: {} },
                checkStatus: -1,
            })
        }
    }
    /**
     * 表格数据rows更新后，重新计算布局
     */
    componentDidUpdate(prevP) {
        // rows 数据更新后, 重新设置col宽度
        if (prevP.rows !== this.props.rows) {
            this._initStructure()
            this.forceUpdate()
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resize)
    }
    /**
     * 容器宽度改变后，重新计算布局
     */
    resize() {
        clearTimeout(this.resizeTimer)
        this.resizeTimer = setTimeout(() => {
            this._initStructure()
            this.forceUpdate()
        }, 500)
    }
    /**
     * 收集th col 的最小宽度
     * @param {*} col 
     * @param {*} el 
     */
    onThMount(col, el) {
        // cannotExpand 不需要根据dom元素设置宽度，因为肯定已经有了
        // 没有th.width 的肯定需要
        if (!el || (col.cannotExpand && col.width)) return
        col.minWidth = el.offsetHeight
    }
    /**
     * 收集td col 的最大宽度
     */
    onRowMount(col, width) {
        /* 暂时，第一次渲染没数据 */
        if (col.cannotExpand || width < col.minWidth) return;

        if (!this.state.complete) {
            col.firstRenderWidth = width
        }

        if (width > col.maxWidthInCol) {
            col.maxWidthInCol = width
        }
    }

    // 判断有没有竖直方向滚动条
    // this.USE_SPLIT_LAYOUT 分体式布局
    // 只有这种布局才需要这些操作
    analyseScroll() {
        const track = this.plainTableBodyTrackEl.current

        if (track) {
            this.scrollBarY = track.offsetWidth - track.clientWidth
            // this.HAS_FIXED 有左右固定列
            this.HAS_FIXED && (this.scrollBarX = track.offsetHeight - track.clientHeight)
        }
    }

    /*
    * 计算结构
    * */
    _initStructure() {

        // 初始化 横向结构, 列宽,
        this.analyseScroll()

        this.USE_TILE_LAYOUT && this.computeColWidth()

    }

    // 根据用户设置,计算表格列宽 及 总宽度
    computeColWidth() {
        // 容器宽度（物理宽度）
        const containerWidth = this.containerEl.current.clientWidth - this.scrollBarY

        const columns = this.columns.all

        let totalWidth = 0
        let hasZero = 0
        let cannotExpandMap = {}
        let cannotExpandTotalWidth = 0;

        // - 将maxColWidthList所有值相加，得出总宽度（计算总宽度）
        // - 记录maxColWidthList中为0的项的数量
        // - 将不允许扩展宽度的列的宽度相加
        // - 记录不允许扩展宽度列的索引

        ; (function () {
            let colWidth = 0
            for (let i = 0, len = columns.length; i < len; i++) {
                colWidth = columns[i].maxWidthInCol

                if (colWidth === 0) hasZero++

                if (columns[i].cannotExpand) {
                    cannotExpandTotalWidth += colWidth
                    cannotExpandMap[i] = true
                }

                totalWidth += colWidth
            }
        }())


        // 如果表格 物理宽度 大于 计算宽度   diff > 0
        const diff = containerWidth - totalWidth

        let minWidth = 0 // minColWidthList的项
        let maxWidthInCol = 0
        let minWidthExact = 0    // 计算出的每列最小宽度
        let lastWidth = 0    // 最终计算出的列宽
        let plainW = 0
        let leftW = 0
        let rightW = 0
        let fixed = null

        const allColumns = columns.map((col, i) => {

            minWidth = col.minWidth
            maxWidthInCol = col.maxWidthInCol

            //  对于像 checkbox|expand 这种列，没有获取节点的最小宽度,  其最小宽度在初始化时(constructor中) 已经被设置了
            // 比较th的宽度 和 td的宽度，哪个宽用哪个

            minWidthExact = minWidth < maxWidthInCol ? maxWidthInCol : minWidth

            lastWidth = minWidthExact

            if (diff > 0) {   // 需要自动扩展 列宽

                if (hasZero) { // 存在 没有设置宽度的 列  ==>>  将多余的平均分配

                    maxWidthInCol === 0 && (lastWidth = diff / hasZero)

                }
                else {     // 不存在 没有设置宽度的列  ==>>  除了不允许扩展的列, 其他均匀分配 多出的

                    !cannotExpandMap[i] && (lastWidth = maxWidthInCol + diff * (maxWidthInCol / (totalWidth - cannotExpandTotalWidth)))

                }

                // 最小宽度
                lastWidth < minWidthExact && (lastWidth = minWidthExact)

            }


            fixed = col.fixed

            if (fixed === 'left') {
                leftW += lastWidth
            }
            else if (fixed === 'right') {
                rightW += lastWidth
            }
            else {
                plainW += lastWidth
            }

            col.maxWidthInCol = lastWidth

            return col
        }) // End forEach

        const totalW = leftW + rightW + plainW

        // -5 只是一个大概值，因为js计算有误差，不能以 0 作为判断
        this.scrollBarX = (containerWidth - totalW) < -5 ? SCROLL_BAR_WIDTH : 0

        this.tableWidth = {
            left: leftW,
            right: rightW,
            plain: plainW,
            total: totalW
        }

        this.columns = Object.assign({}, this.columns, { all: allColumns })
    }



    /*---    同步滚动    ---*/
    syncScroll(e) {
        const state = this.state
        const left = e.currentTarget.scrollLeft
        const top = e.currentTarget.scrollTop;

        if (this.plainTableHeadTrackEl.current) {
            this.plainTableHeadTrackEl.current.scrollLeft = left
        }
        if (this.bottomTable) {
            this.bottomTable.scrollLeft = left
        }
        if (state.topShadow !== (top > 0)) {
            this.setState({ topShadow: !state.topShadow })
        }

        if (this.HAS_LEFT) {
            this.leftTableTbodyEl.current.scrollTop = top
            if (state.leftShadow !== (left > 0)) {
                this.setState({ leftShadow: !state.leftShadow })
            }
        }

        if (this.HAS_RIGHT) {
            this.rightTableTbodyEl.current.scrollTop = top
            if (state.rightShadow !== (this.containerEl.current.clientWidth + left - (this.tableWidth.total+this.scrollBarX)< -5)) {
                this.setState({ rightShadow: !state.rightShadow })
            }
        }

    }
  



    render() {
        const state = this.state
        const props = this.props
        const columns = this.columns
        const tableWidth = this.tableWidth

        // 排序
        const sortMap = state.sortMap
        // 表格宽度
        const plainTableWidth = tableWidth.plain
        const leftTableWidth = tableWidth.left
        const rightTableWidth = tableWidth.right

        //固定底部表格高度
        const bottomTableHeight = state.fixedBottomHeight
        // 固定 右 | 左 两侧表格的高度
        const fixedTableHeight = (this.HAS_FIXED && this.USE_SPLIT_LAYOUT) ? (props.tableHeight - this.scrollBarX - bottomTableHeight) : 'auto'
        console.log('render')

        /**
         * 
         * 渲染 colgroup 元素
         * 
         */
        const renderColumns = (columns) => (
            !state.complete ? null : (
                <colgroup>
                    {
                        /**
                         * 关于 width 还待研究
                         */
                    }
                    {columns.map(col => <col key={col.__i__} style={{ minWidth: col.minWidth, width: col.firstRenderWidth || col.minWidth /* 暂时 */ }} />)}
                </colgroup>
            )
        )
        /**
         * 渲染 thead
         * @param {array} columns  this.columns
         */
        const renderTHead = (columns) => {

            const renderPlainTh = (col) => (
                <React.Fragment>
                    <span ref={this.onThMount.bind(this, col)} className='u-th-content'>
                        {col.label}
                        {
                            col.needSort && (
                                <span
                                    onClick={this.sortData.bind(this, col.prop, col)}
                                    className={'sort-sign ' + (sortMap.current === col.prop ? (sortMap.order === ASC ? 'forward' : 'reverse') : 'un-active')}
                                >
                                    <Icon type='down-fill' className='up-arrow' />
                                    <Icon type='down-fill' className='down-arrow' />
                                </span>
                            )
                        }
                    </span>
                    {
                        props.dragAble && (
                            <i
                                className='u-table-resize-btn'
                                onMouseDown={e => this.prepareResizeCol(e, col.__i__, col.fixed || 'plain')}>
                            </i>
                        )
                    }
                </React.Fragment>
            )

            const renderCheckboxTh = () => (
                {/* <Icon type={checkStatus === 0 ? '_half-checked' : checkStatus > 0 ? 'check-fill' : 'check'}
                    onClick={this.checkedAll} /> */}
            )

            return (
                <thead>
                    <tr className='u-tr'>
                        {
                            columns.map((col) => {
                                const type = col.type
                                const align = type ? ' _align-center' : cn(col.align, '_align-')
                                return (
                                    <th className={'u-th' + align} key={col.__i__}>
                                        {/*ie中应该不能将td th作为绝对定位的参照节点， 所以如果 在 th td内有绝对定位的元素，样式会出问题*/}
                                        {/*加一层div, 并将其style设置为position:relative ，来标准化这一样式*/}
                                        <div className={'u-th-content-wrap' + cn(col.className)}>
                                            {
                                                (type === 'expand' || type === 'radio') ? null
                                                    : type === 'checkbox' ? renderCheckboxTh()
                                                        : type === 'index' ? '#'
                                                            : renderPlainTh(col)
                                            }
                                        </div>
                                    </th>
                                )
                            })
                        }
                    </tr>
                </thead>

            )
        }

        const renderTBody = (columns, tType, needSync) => {

            let rows = tType === -2 ? props.fixedRows : props.rows
            // 表格排序
            if (!props.databaseSort && sortMap.current && rows && rows.length > 0 && tType === 0) {
                rows = this.sortRows(rows)
            }

            return (
                <React.Fragment>
                    {props.loading && tType === 0 ? <Icon type='loading' /> : null}
                    {
                        (rows && rows.length > 0)
                            ? (

                                <tbody>
                                    {rows.map((tr, i) => (
                                        <Row
                                            key={'u-tr' + i}
                                            rowIndex={i}
                                            tr={tr}
                                            align={props.align}
                                            checkState={this.checkState}
                                            columns={columns}
                                            bgColor={props.zebra && (i % 2 === 0 ? 'lighten' : 'darken')}
                                            isFixed={tType !== 0}
                                            isBottom={tType === -2}
                                            syncData={state.syncData}
                                            checkStatus={state.checkStatus}
                                            colMinRenderWidthList={this.colMinRenderWidthList}
                                            syncRow={needSync ? this.syncRow.bind(this) : null}
                                            onRowMount={this.onRowMount}
                                            onChecked={this.checkedRow}
                                            onTdClick={this.props.onTdClick}
                                        />
                                    ))}
                                </tbody>
                            )
                            : (
                                (tType === 0 && !props.loading)
                                    ? (<div className='empty-table-tip'>{props.emptyTip || (<span className='empty-tip__span'>暂无数据</span>)}</div>)
                                    : null
                            )
                    }
                </React.Fragment>
            )
        }

        const renderTable = (colgroup, thead, tbody, style) => {
            return (
                <table className={'u-table'} border='0' cellSpacing='0' cellPadding={0} style={style}>
                    {colgroup}
                    {thead}
                    {tbody}
                </table>
            )
        }

        const renderSplitLayoutTable = () => {
            const colgroup = renderColumns(columns.plain)
            // 固定右侧的占位符
            const rightPlaceholder = this.HAS_RIGHT && (
                <div className={'u-table-right-placeholder'} style={{ width: rightTableWidth, height: 1 }}> </div>
            );

            return (
                <div className='u-plain__table u-main__table'>
                    <div className={'u-header__track ' + (state.topShadow ? 'shadow ' : '')}
                        style={{ paddingLeft: `${leftTableWidth}px`, overflowY: this.scrollBarY ? 'scroll' : 'hidden' }}
                        ref={this.plainTableHeadTrackEl}
                    >
                        <div className="u-table-header">
                            {renderTable(colgroup, renderTHead(columns.plain), null, { width: plainTableWidth })}
                            {/* 右侧固定列占位符 */}
                        </div>
                        {rightPlaceholder}
                    </div>

                    <div className='u-body__track'
                        style={{ height: props.tableHeight, paddingLeft: `${leftTableWidth}px` }}
                        ref={this.plainTableBodyTrackEl}
                        onScroll={this.syncScroll}
                    >
                        <div className="u-table-body">
                            {renderTable(colgroup, null, renderTBody(columns.plain), { width: plainTableWidth })}
                        </div>

                        {
                            /**
                             * 在有些浏览器中，padding-bottom 和 padding-right的布局标准有些怪异，导致不会计入 scrollWidth | scrollHeight, 
                             * 所以需要使用空div占位符 
                             */
                        }
                        {rightPlaceholder}
                        {bottomTableHeight > 0 && <div style={{ height: bottomTableHeight }}></div>}
                    </div>
                </div>
            )
        }
        const renderLeftTable = () => {
            const colgroup = renderColumns(columns.left)
            return (
                <div className={'u-fixed-left__table ' + (state.leftShadow ? '_shadow ' : '')} style={{ width: leftTableWidth }}>
                    <div className={'u-table-header ' + (state.topShadow ? '_shadow ' : '')}>
                        {renderTable(colgroup, renderTHead(columns.left))}
                    </div>
                    <div className="u-table-body"
                        style={{ height: fixedTableHeight }}
                        ref={this.leftTableTbodyEl}
                    >
                        {renderTable(colgroup, null, renderTBody(columns.left))}
                    </div>
                </div>
            )
        }

        const renderRightTable = () => {
            const colgroup = renderColumns(columns.right)

            return (
                <div className={'u-fixed-right__table ' + (state.rightShadow ? '_shadow ' : '')}
                    style={{ width: rightTableWidth, right: (this.scrollBarY) }}>
                    <div className={'u-table-header ' + (state.topShadow ? '_shadow ' : '')}>
                        {renderTable(colgroup, renderTHead(columns.right))}
                    </div>
                    <div className="u-table-body"
                        style={{ height: fixedTableHeight }}
                        ref={this.rightTableTbodyEl}
                    >
                        {renderTable(colgroup, null, renderTBody(columns.right))}
                    </div>
                </div>
            )
        }



        /**
         * 
         * 根节点
         * 
         */
        return (
            /* 总容器 */
            <div className={'u-table-container' + cn(props.className) + cn(props.align, '_align-') + cn(props.type, '_')}
                ref={this.containerEl}
                style={{ opacity: state.complete ? 1 : 0 }}
            >
                {/* 普通表格 */}
                {
                    this.USE_SPLIT_LAYOUT
                        ? renderSplitLayoutTable()
                        : renderTable(renderColumns(columns.plain), renderTHead(columns.plain), renderTBody(columns.plain))
                }

                {/* 左固定表格 */}
                {this.HAS_LEFT && renderLeftTable()}

                {/* 右固定表格 */}
                {this.HAS_RIGHT && renderRightTable()}


            </div>
        )
    }
}


Table.defaultProps = {
    columns: [],
    type: 'stretch',
    align: 'center',
    fixedRows: null,
    rows: [],
    databaseSort: false,  // 是否使用数据库排序, 默认是表格自动排序
    dragAble: false,  // 允许用户拖拽设置表格列宽
    onSortChange: () => { },
    onTdClick: () => { },
    onSelectRowChange: () => { },
}

Table.propTypes = {
    columns: PropTypes.array,     // 列配置
    tableHeight: PropTypes.number,    // 表格体高度
    type: PropTypes.oneOf(['tile', 'stretch']),

    zebra: PropTypes.bool,        // 是否需要斑马线
    loading: PropTypes.bool,      // 控制表格显示loading
    dragAble: PropTypes.bool, // 禁用设置表格列宽
    databaseSort: PropTypes.bool, // 排序方式，表格自身排序 | 数据库排序（有onSortChange事件）

    onTdClick: PropTypes.func,    // 点击表格单元格
    onSortChange: PropTypes.func, // 选择数据库排序，排序变化时触发
    onSelectRowChange: PropTypes.func, // 表格行选中改变

    emptyTip: PropTypes.node,     // 定义表格为空数据时要显示的提示
    align: PropTypes.oneOf(['left', 'right', 'center']), // 表格内文本对齐
    // responsive: PropTypes.bool,   // 自适应布局
    rows: PropTypes.array,
    // fixedRows:
}

export default Table