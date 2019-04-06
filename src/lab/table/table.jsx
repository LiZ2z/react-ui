import React from 'react';
import Icon from '../../ui/components/icon';
import Row from './row';
import PropTypes from 'prop-types';
import {
    checkType,
    checkStatus
} from './const-data';
import cn from './utils/class-name';
import SCROLL_BAR_WIDTH from './utils/scroll-bar-width';


import useBigDataRender from '../big-data-render-pro/hooks';

const ASC = '_asc';  //正序
const DESC = '_desc'; //反序

const {CHECKED, NOT_CHECKED, HALF_CHECKED} = checkStatus;
const {RADIO, CHECKBOX, NONE} = checkType;


class Table extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            complete: false,
            signOffset: 0,  // 调整表格列宽时, 指示器样式
            leftShadow: false,  // 阴影
            rightShadow: true,
            topShadow: false,
            checkStatus: NOT_CHECKED,  // -1 全不选中  0 部分  1全选
            sortMap: {current: '', order: ASC} // 表格排序, current 为当前行的prop. order  ASC正序 DESC 反序
        };

        this.containerEl = {current: null};
        this.leftTableBodyEl = {current: null};
        this.rightTableBodyEl = {current: null};
        this.plainTableBodyTrackEl = {current: null};
        this.plainTableHeadTrackEl = {current: null};

        // 根据colums数据， 进行预处理
        this.initialize(props);

        this.resize = this.resize.bind(this);
        this.moveSign = this.moveSign.bind(this);
        this.resizeCol = this.resizeCol.bind(this);
        this.syncScroll = this.syncScroll.bind(this);
        this.onRowMount = this.onRowMount.bind(this);
        this.checkedAll = this.checkedAll.bind(this);
        this.handleBottomMount = this.handleBottomMount.bind(this);
        this.handleRowChecked = this.handleRowChecked.bind(this);
    }

    /**
     * 数据预处理
     *
     * */
    initialize(props) {
        this.syncRowMap = {};
        this.tableWidth = {plain: '100%', left: 0, right: 0, total: 0};
        // 多选或单选表格， 选中的表格行
        this.checkedList = [];

        this.scrollBarY = 0;
        this.scrollBarX = 0;

        // 底部表格高度
        this.bottomTableHeight = 0;

        const propsColumns = [...props.columns];
        const columns = {
            left: [],
            plain: [],
            right: [],
            all: []
        };
        let tableType = NONE;
        let col = null;
        let type = null;
        let isCheckbox = false;
        let isRadio = false;
        let minWidth = 0;
        for (let i = 0, len = propsColumns.length; i < len; i++) {
            col = Object.assign({}, propsColumns[i]);  // 拷贝
            type = col.type;
            isCheckbox = type === 'checkbox';
            isRadio = type === 'radio';

            // 记录原始位置
            col.__i__ = i;

            // 最小缩放宽度
            minWidth = col.width || ((isCheckbox || isRadio || type === 'expand' || type === 'index') ? 50 : null);
            col.minWidth = minWidth;         // 最小允许宽度
            col.maxWidthInCol = minWidth;    // 一列中最大宽度
            col.firstRenderWidth = minWidth; // 首次渲染后 ， 一列中最大宽度

            // 如果 设置type 或 width 则 禁止展宽
            if (type || col.fixed) {
                col.cannotExpand = true;
            }

            // 根据fixed 属性， 分配
            switch (col.fixed) {
                case 'left':
                    columns.left.push(col);
                    break;
                case 'right':
                    columns.right.push(col);
                    break;
                default:
                    columns.plain.push(col);
                    break;
            }

            columns.all.push(col);

            // 定义表格的类型
            if (tableType === NONE) {
                tableType = isCheckbox ? CHECKBOX : (isRadio ? RADIO : NONE);
            }

        }


        this.columns = columns;
        this.checkState = tableType; // 当前表格的类型  带有单选 | 有多选功能  | 无

        this.HAS_LEFT = columns.left.length > 0;
        this.HAS_RIGHT = columns.right.length > 0;
        this.HAS_BOTTOM = props.fixedRows.length > 0;

        this.HAS_FIXED = this.HAS_LEFT || this.HAS_RIGHT;


        // TODO: 是否第一次确定后，以后不可更改
        // 使用平铺布局
        this.USE_TILE_LAYOUT = this.HAS_FIXED || props.dragAble || props.type === 'tile';
        //使用分体式布局
        this.USE_SPLIT_LAYOUT = this.HAS_FIXED || !!props.tableHeight || props.useSplitLayout;

        // 首次渲染完成
        if (this.state.complete) return;
        // 第一次渲染有无数据
        this.hasNoData = props.rows.length === 0;
    }

    /**
     * 初次渲染完成后，开始计算布局
     */
    componentDidMount() {
        this.initStructureWhenUpdated();

        window.addEventListener('resize', this.resize);
    }

    /**
     * 表格数据rows更新后，重新计算布局
     */
    //TODO: 流程待优化
    componentDidUpdate(prevProps) {
        const currentProps = this.props;

        if (prevProps.columns !== currentProps.columns) {
            this.initialize(currentProps);
            this.setState({
                complete: false,
                checkStatus: NOT_CHECKED,
                sortMap: {current: '', order: ASC}
            }, () => {
                // 重新计算
                this.initStructureWhenUpdated();
            });
        }
        // rows 数据更新后, 重新设置col宽度
        else if (prevProps.rows !== currentProps.rows) {
            // 将所有 checkbox状态清空
            if (currentProps.clearStateWhenRowsChange) {
                this.checkedList = [];
                this.setState({checkStatus: NOT_CHECKED});
            }
            this._initStructure();
            this.forceUpdate();
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resize);
    }

    // ----------------------------------------start------------------------------------------------
    // ----------------------------------------start------------------------------------------------
    /**
     * 切换表格全选中
     * */
    checkedAll() {
        const props = this.props;
        const rows = props.rows;
        const isChecked = this.state.checkStatus === CHECKED;
        this.checkedList = isChecked || (!rows || rows.length === 0) ? [] : [...rows];
        this.setState({
            checkStatus: isChecked ? NOT_CHECKED : CHECKED
        }, () => {
            props.onSelectRowChange(this.checkedList);
        });
    }

    /**
     * 切换表格行选中状态
     * @param {object} row 表格行数据
     * @param {boolean} isChecked 是否是选中状态
     * @param {number} rowIndex 表格行索引
     * @param {boolean} shouldEmit 是否需要向外层发送
     * */
    handleRowChecked(row, isChecked, rowIndex, shouldEmit = true) {
        const emitChange = this.props.onSelectRowChange;
        if (this.checkState === RADIO) { // 单选表格
            emitChange([row]);
            return;
        }
        const oldList = this.checkedList;
        // 根据选中还是不选择, 从checkedList 添加 或  清除 该项
        oldList[rowIndex] = isChecked ? row : null;

        if (!shouldEmit) {
            return;
        }
        // 格式化结构用于向外层发送
        const arr = oldList.filter(item => !!item);
        // 判断总体选中状态  全选中, quanweixuanz
        const len = arr.length;
        const max = this.props.rows.length;
        const newStatus = max === len ? CHECKED : (len === 0 ? NOT_CHECKED : HALF_CHECKED);

        if (this.state.checkStatus !== newStatus) {
            this.setState({
                checkStatus: newStatus
            });
        }
        emitChange(arr);
    }

    // ----------------------------------------end------------------------------------------------
    // ----------------------------------------end------------------------------------------------

    /**
     * Row渲染之前
     * @param {object} data : rowData
     * @param {number} index
     */
    beforeRowMount(data, index) {
        const rowProps = this.props.onRow(data, index);
        if (!rowProps) {
            return null;
        }
        if (typeof rowProps !== 'object' || Object.prototype.toString.call(rowProps) === '[object Array]') {
            if (process.env.NODE_ENV === 'development') {
                throw TypeError(`onRow函数的返回值必须为对象格式！`);
            }
            return null;
        }
        return rowProps;
    }

    /**
     * 容器宽度改变后，重新计算布局
     */
    resize() {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this._initStructure();
            this.forceUpdate(() => {
                const queue = this.syncRowMap;
                for (let item in queue) {
                    if (!queue.hasOwnProperty(item)) {
                        continue;
                    }
                    queue[item].resize();
                }
                // this.syncRowMap.forEach(item => item.resize());
            });
        }, 500);
    }

    /**
     * 当 columns 数据更新且渲染后，重新计算结构信息
     *
     * */
    initStructureWhenUpdated() {
        this._initStructure();

        // 首次渲染完成
        setTimeout(() => {
            this.setState({complete: true}, () => {
                // 当有fixedBottomTable时， 因为要获取bottom table高度
                // 然后用于设置fixedLeft  fixedRight table高度， 此时会影响滚动条
                // 所以再初始化结构后 在计算一次有没有滚动条
                setTimeout(() => {
                    this.analyseScroll();
                });
            });
        });
    }

    /**
     * 收集th col 的最小宽度
     * @param {*} col
     * @param {*} el
     */
    onThMount(col, el) {
        // cannotExpand 不需要根据dom元素设置宽度，因为肯定已经有了
        // 如果已设置col.width 则以col.width作为最小宽度， 也不需要设置
        if (!el || this.state.complete || col.width || (col.cannotExpand && col.width)) return;
        const domWidth = el.offsetWidth + 5;
        col.minWidth = domWidth;
        col.maxWidthInCol = domWidth;    // 一列中最大宽度
        col.firstRenderWidth = domWidth;
    }

    /**
     * 收集td col 的最大宽度
     */
    onRowMount(col, width) {
        // 如果cannotExpand 或者 td内容宽度 小于最小宽度 或者  td内容宽度 小于 当前已有的最大宽度
        // 不进行下一步
        if (col.cannotExpand || width < col.minWidth || width < col.maxWidthInCol) return;

        col.maxWidthInCol = width;
        // 如果第一次渲染没有数据，这一步将一直不会执行， firstRender = minWidth
        if (!this.state.complete) {
            col.firstRenderWidth = width;
        }
    }

    /**
     * 判断有没有竖直方向滚动条
     * 只有 this.USE_SPLIT_LAYOUT 分体式布局 才需要这些操作
     * */
    analyseScroll() {
        const track = this.plainTableBodyTrackEl.current;

        if (track) {
            this.scrollBarY = track.offsetWidth - track.clientWidth;
            // this.HAS_FIXED 有左右固定列
            this.USE_TILE_LAYOUT && (this.scrollBarX = track.offsetHeight - track.clientHeight);
        }
    }

    /*
    * 计算结构
    * */
    _initStructure() {

        // 初始化 横向结构, 列宽,
        this.analyseScroll();

        if (!this.USE_TILE_LAYOUT) return;

        this.computeColWidth();

    }

    /**
     * 根据用户设置,计算表格列宽 及 总宽度
     * */
    computeColWidth() {
        // 容器宽度（物理宽度）
        const containerWidth = this.containerEl.current.clientWidth - this.scrollBarY;

        const columns = this.columns.all;

        let totalWidth = 0;
        let hasZero = 0;
        let cannotExpandMap = {};
        let cannotExpandTotalWidth = 0;

        // - 将maxColWidthList所有值相加，得出总宽度（计算总宽度）
        // - 记录maxColWidthList中为0的项的数量
        // - 将不允许扩展宽度的列的宽度相加
        // - 记录不允许扩展宽度列的索引

        (function () {
            let colWidth = 0;
            for (let i = 0, len = columns.length; i < len; i++) {
                colWidth = columns[i].maxWidthInCol;

                if (colWidth === 0) hasZero++;

                if (columns[i].cannotExpand) {
                    cannotExpandTotalWidth += colWidth;
                    cannotExpandMap[i] = true;
                }

                totalWidth += colWidth;
            }
        }());

        // console.log(hasZero)


        // 如果表格 物理宽度 大于 计算宽度   diff > 0
        const diff = containerWidth - totalWidth;

        let minWidth = 0; // minColWidthList的项
        let maxWidthInCol = 0;
        let minWidthExact = 0;    // 计算出的每列最小宽度
        let lastWidth = 0;    // 最终计算出的列宽
        let plainW = 0;
        let leftW = 0;
        let rightW = 0;
        let fixed = null;

        const allColumns = columns.map((col, i) => {

            minWidth = col.minWidth;
            maxWidthInCol = col.maxWidthInCol;

            //  对于像 checkbox|expand 这种列，没有获取节点的最小宽度,  其最小宽度在初始化时(constructor中) 已经被设置了
            // 比较th的宽度 和 td的宽度，哪个宽用哪个

            minWidthExact = minWidth < maxWidthInCol ? maxWidthInCol : minWidth;

            lastWidth = minWidthExact;

            if (diff > 0) {   // 需要自动扩展 列宽
                if (hasZero) { // 存在 没有设置宽度的 列  ==>>  将多余的平均分配
                    if (maxWidthInCol === 0) {
                        lastWidth = diff / hasZero;
                    }
                } else {     // 不存在 没有设置宽度的列  ==>>  除了不允许扩展的列, 其他均匀分配 多出的
                    if (!cannotExpandMap[i]) {
                        lastWidth = maxWidthInCol + diff * (maxWidthInCol / (totalWidth - cannotExpandTotalWidth));
                    }
                }
                // 最小宽度
                lastWidth < minWidthExact && (lastWidth = minWidthExact);
            }


            fixed = col.fixed;

            if (fixed === 'left') {
                leftW += lastWidth;
            }
            else if (fixed === 'right') {
                rightW += lastWidth;
            }
            else {
                plainW += lastWidth;
            }

            col.maxWidthInCol = lastWidth;

            return col;
        }); // End forEach

        const totalW = leftW + rightW + plainW;

        // -5 只是一个大概值，因为js计算有误差，不能以 0 作为判断
        this.scrollBarX = containerWidth - totalW < 0 ? SCROLL_BAR_WIDTH : 0;

        this.tableWidth = {
            left: leftW,
            right: rightW,
            plain: plainW,
            total: totalW
        };

        this.columns = Object.assign({}, this.columns, {all: allColumns});
    }

    /**
     * 同步表格体的滚动
     * */
    syncScroll(e) {
        const state = this.state;
        const left = e.currentTarget.scrollLeft;
        const top = e.currentTarget.scrollTop;

        if (this.plainTableHeadTrackEl.current) {
            this.plainTableHeadTrackEl.current.scrollLeft = left;
        }
        if (this.HAS_BOTTOM) {
            this.bottomTableEl.scrollLeft = left;
        }
        if (state.topShadow !== (top > 0)) {
            this.setState({topShadow: !state.topShadow});
        }

        if (this.HAS_LEFT) {
            this.leftTableBodyEl.current.scrollTop = top;
            if (state.leftShadow !== (left > 0)) {
                this.setState({leftShadow: !state.leftShadow});
            }
        }

        if (this.HAS_RIGHT) {
            this.rightTableBodyEl.current.scrollTop = top;
            if (state.rightShadow !== (this.containerEl.current.clientWidth + left - this.scrollBarY - this.tableWidth.total < -5)) {
                this.setState({rightShadow: !state.rightShadow});
            }
        }

    }

    /**
     * 固定在底部的表格mounted之后会触发该事件
     * */
    handleBottomMount(el) {
        if (!el) return;
        this.bottomTableEl = el;
        this.bottomTableHeight = el.clientHeight;
    }

    /**
     * 调整表格列大小
     * */
    getOffsetLeft(e) {
        const C = this.containerEl.current;
        const P = C.getBoundingClientRect();
        return e.clientX - P.left + C.scrollLeft;
    }

    prepareResizeCol(e, col) {
        e.preventDefault();
        e.stopPropagation();

        // 记录调整的  1. 列索引  2. 初始位置

        this.resizeData = {
            col: col,
            offset: this.getOffsetLeft(e)
        };

        document.addEventListener('mousemove', this.moveSign);
        document.addEventListener('mouseup', this.resizeCol);
    }

    /**
     * 移动指示器位置
     * */
    moveSign(e) {
        this.setState({
            signOffset: this.getOffsetLeft(e)
        });
    }

    resizeCol() {
        document.removeEventListener('mousemove', this.moveSign);
        document.removeEventListener('mouseup', this.resizeCol);

        const offset = this.state.signOffset;
        if (!offset) return;

        const data = this.resizeData;
        const col = data.col;
        const maxWidthInCol = col.maxWidthInCol;
        const minWidthExact = col.minWidth; // 根据每列的表头, 设置最小宽度
        let newWidth = maxWidthInCol + offset - data.offset;
        const containerWidth = this.containerEl.current.clientWidth - this.scrollBarY; // 容器宽度

        if (newWidth < minWidthExact) {
            newWidth = minWidthExact;
        }

        let diff = newWidth - maxWidthInCol; //位移差, 调整了的宽度
        let subDiff = containerWidth - (this.tableWidth.total + diff); //容器宽度 - 新的总宽度

        if (subDiff > 0) {  // 如果新总宽度 小于容器宽度, 禁止缩小
            newWidth += subDiff;
            diff += subDiff;
        }

        // 记录  并调整表格总宽度
        this.tableWidth.plain += diff;
        this.tableWidth.total += diff;

        // 记录  并调整  对应列的宽度
        col.maxWidthInCol = newWidth;
        // 判断要不要显示水平轴 滚动条
        // -5 只是一个大概值，因为js计算有误差，不能以 0 作为判断
        this.scrollBarX = subDiff < -5 ? SCROLL_BAR_WIDTH : 0;

        // 把标志线归零 , 顺便触发整个更新
        this.setState({
            signOffset: 0
        });
    }

    /**
     * *表格排序
     * @param {object} col
     */
    sortData(col) {
        const key = col.prop;
        const map = this.state.sortMap;
        const order = map.current === key ? (map.order === ASC ? DESC : ASC) : ASC;
        const newMap = {
            current: key,
            order: order
        };
        this.setState({
            sortMap: newMap
        });
        this.props.onSortChange(Object.assign({}, newMap), col);
    }

    /**
     * *排序rows 并返回新的rows
     * @param {props.rows} rows
     */
    sortRows(rows) {
        // 如果排序规则没变, 表格数据没变, 且有 已经排序过的 rows数据, 则直接用已经排序过的
        if (!this.sortedRows || this.rows !== this.props.rows || this.sortMap !== this.state.sortMap) {
            // 缓存上次状态
            this.rows = this.props.rows;
            this.sortMap = this.state.sortMap;
            const match = this.sortMap.current;
            const rule = this.sortMap.order === ASC ? 1 : -1;
            this.sortedRows = rows.sort((p, n) => (n[match] - p[match]) * rule);
        }

        return this.sortedRows;
    }

    render() {
        if (process.env.NODE_ENV === 'development') {
            console.log('render Table');
        }
        const state = this.state;
        const props = this.props;
        const columns = this.columns;
        // 表格排序
        let rows = props.rows;
        if (
            !props.databaseSort &&
            state.sortMap.current &&
            rows.length > 0
        ) {
            rows = this.sortRows(rows);
        }
        return (
            <div
                className={
                    cn(
                        'u-table-container',
                        props.className,
                        `_align-${props.align}`,
                        `_${props.type}`
                    )
                }
                ref={this.containerEl}
                style={{opacity: state.complete ? 1 : 0}}
            >
                {
                    props.dragAble && (
                        <div className="resize-col-sign"
                             style={{
                                 display: state.signOffset ? 'block' : 'none',
                                 left: state.signOffset
                             }}>
                        </div>
                    )
                }
                {
                    props.loading ?
                        (
                            <div className='u-table-loading-wrap'>
                                <Icon type='loading'/>
                            </div>
                        ) :
                        null
                }

                {/* 普通表格 */}
                {
                    this.USE_SPLIT_LAYOUT ?
                        renderSplitLayoutTable.call(this, columns.plain, rows) :
                        renderTable(
                            renderColumns.call(this, columns.plain),
                            renderTHead.call(this, columns.plain),
                            renderTBody.call(this, columns.plain, rows, 'normal')
                        )
                }
                {/* 左固定表格 */}
                {
                    this.HAS_LEFT && renderLeftTable.call(this, columns.left, rows)
                }
                {/* 右固定表格 */}
                {
                    this.HAS_RIGHT && renderRightTable.call(this, columns.right, rows)
                }
                {/* 下固定表格 */}
                {
                    this.HAS_BOTTOM && renderBottomTable()
                }
            </div>
        );
    }

}


/**
 * 渲染固定右侧的占位符
 * */
const rightPlaceholder = function () {
    return this.HAS_RIGHT && (
        <div className={'u-table-right-placeholder'}
             style={{
                 height: 1,
                 width: this.tableWidth.right,
                 visibility: 'hidden'
             }}
        >
        </div>
    );
};

/**
 * 渲染 colgroup 元素
 */
const renderColumns = function (columns) {
    return !this.state.complete ? null : (
        <colgroup>
            {
                columns.map(col => (
                    <col key={col.__i__}
                         style={{
                             minWidth: col.minWidth,
                             width: this.USE_TILE_LAYOUT ? col.maxWidthInCol : col.minWidth
                         }}
                    />
                ))
            }
        </colgroup>
    );
};


/**
 * 渲染普通的 TH 元素
 * */
const renderPlainTh = function (col) {
    return <React.Fragment>
                    <span ref={this.onThMount.bind(this, col)} className='u-th-content'>
                        {col.title}
                        {
                            col.needSort && (
                                <span
                                    onClick={this.sortData.bind(this, col)}
                                    className={'sort-sign ' + (this.state.sortMap.current === col.prop ? this.state.sortMap.order : 'un-active')}
                                >
                                    <Icon type='arrow-fill' className='_up'/>
                                    <Icon type='arrow-fill' className='_down'/>
                                </span>
                            )
                        }
                    </span>
        {
            (this.props.dragAble && !col.fixed) && (
                <i
                    className='u-table-resize-btn'
                    onMouseDown={e => this.prepareResizeCol(e, col)}>
                </i>
            )
        }
    </React.Fragment>;
};
/**
 * 渲染 thead
 * @param {array} columns
 */
const renderTHead = function (columns) {

    return (
        <thead>
        <tr className='u-tr'>
            {
                columns.map((col) => {
                    const type = col.type;
                    return (
                        <th
                            key={col.__i__}
                            className={
                                cn('u-th',
                                    type ? '_align-center' : (col.align ? `_align-${col.align}` : ''),
                                    col.className
                                )
                            }
                        >
                            {
                                // ie中不能将td th作为绝对定位的参照节点，
                                // 所以如果 在th td内有绝对定位的元素，样式会出问题
                                // 加一层div, 并将其style设置为position:relative ，来标准化这一样式
                            }
                            <div className={'u-th-content-wrap'}>
                                {
                                    (type === 'expand' || type === 'radio') ?
                                        null :
                                        type === 'checkbox' ?
                                            (
                                                <Icon
                                                    type={'square'}
                                                    onClick={this.checkedAll}
                                                    className={this.state.checkStatus}
                                                />
                                            ) :
                                            type === 'index' ? '#' : renderPlainTh.call(this, col)
                                }
                            </div>
                        </th>
                    );
                })
            }
        </tr>
        </thead>
    );
};

/**
 * 渲染 tobody
 * */
const renderTBody = function (columns, data, startIndex, tType) {
    const {state, props} = this;
    const isBottom = tType === 'bottom';
    const isNormal = tType === 'normal';
    const hasData = props.rows.length > 0;

    return (
        <tbody>
        {
            hasData ?
                data.map((rowData, i) => {
                    const index = i + startIndex;

                    const customerProps = this.beforeRowMount(rowData, index);
                    const key = props.rowKey ? rowData[props.rowKey] : index;

                    return (
                        <Row
                            {...customerProps}
                            key={key}
                            rowData={rowData}
                            columns={columns}
                            isBottom={isBottom}
                            needSync={this.HAS_FIXED}
                            checkState={this.checkState} // 表格 多选 还是单选
                            isFixed={!isNormal && !isBottom}
                            // 样式
                            bgColor={props.zebra && (index % 2 === 0 ? '_lighten' : '_darken')}
                            // check
                            rowIndex={isBottom ? ('b-' + key) : key}
                            checkStatus={state.checkStatus}
                            onChecked={this.handleRowChecked}
                            // 同步状态
                            syncRowMap={this.syncRowMap}
                            // 计算布局
                            onRowMount={this.onRowMount}
                        />
                    );
                }) :
                isNormal ? (
                    <tr>
                        <td colSpan={columns.length} className='u-table-empty-tip-wrap'>
                            {props.emptyTip || (<div className='u-table-empty-tip'>暂无数据</div>)}
                        </td>
                    </tr>
                ) : null
        }
        </tbody>
    );
};


/**
 * 渲染表格table
 * */
const renderTable = function (colGroup, tHead, tBody, style) {
    return (
        <table className={'u-table'} border='0' cellSpacing='0' cellPadding='0' style={style}>
            {colGroup}
            {tHead}
            {tBody}
        </table>
    );
};

// 固定 右 | 左 两侧表格的高度
const getFixedTableHeight = function () {
    const props = this.props;
    return (this.HAS_FIXED && props.tableHeight && props.tableHeight !== 0) ?
        (props.tableHeight - this.scrollBarX - this.bottomTableHeight) :
        'auto';
};

/**
 * 渲染左侧固定表格
 * */
const renderLeftTable = function (columns, rows) {
    const state = this.state;
    const colGroup = renderColumns.call(this, columns);
    const leftTableWidth = this.tableWidth.left;
    const fixedTableHeight = getFixedTableHeight.call(this);
    const obj = {
        parent: this,
        rows,
        height: fixedTableHeight,
        columns,
        colGroup,
        forwardRef: this.leftTableBodyEl,
        tType: 'left'
    };
    return (
        <div className={'u-fixed-left__table' + (state.leftShadow ? ' _shadow' : '')}
             style={{width: leftTableWidth}}>
            <div className={'u-table-header' + (state.topShadow ? ' _shadow ' : '')}>
                {renderTable(colGroup, renderTHead.call(this, columns))}
            </div>

            <FixedTableBody {...obj} />
        </div>
    );
};
/**
 * 渲染右侧固定表格
 * */
const renderRightTable = function (columns, rows) {
    const state = this.state;
    const colGroup = renderColumns.call(this, columns);
    const fixedTableHeight = getFixedTableHeight.call(this);
    const obj = {
        parent: this,
        rows,
        height: fixedTableHeight,
        columns,
        colGroup,
        forwardRef: this.rightTableBodyEl,
        tType: 'right'
    };
    return (
        <div className={'u-fixed-right__table ' + (state.rightShadow ? '_shadow ' : '')}
             style={{width: this.tableWidth.right, right: (this.scrollBarY)}}>
            <div className={'u-table-header ' + (state.topShadow ? '_shadow ' : '')}>
                {renderTable(colGroup, renderTHead.call(this, columns))}
            </div>
            <FixedTableBody {...obj} />
        </div>
    );
};


const FixedTableBody = function ({parent, rows, height, columns, colGroup, forwardRef, tType}) {
    const range = parent.props.bigDataRenderRange;
    const {
        // 容器
        containerStyle,
        handleContainerScroll,
        // 轨道
        trackHeight,
        //  内容
        contentRef,
        contentStyle,
        data,
        step,
        // 状态及数据
        shouldRenderDirectly,
    } = useBigDataRender({
        data: rows,
        height,
        range
    });

    const extendStyle = Object.assign({}, containerStyle, {
        height,
    });

    return <div
        onScroll={handleContainerScroll}
        style={extendStyle}
        className={'u-table-body'}
        ref={forwardRef}
    >
        <div style={shouldRenderDirectly ? null : {height: trackHeight}}>
            <div
                ref={contentRef}
                style={contentStyle}
            >
                {renderTable(colGroup, null, renderTBody.call(parent, columns, data, step * range, tType))}
            </div>
        </div>

    </div>;
};

const SplitLayoutTableBody = function ({parent, rows, height, columns, colGroup, forwardRef}) {
    const range = parent.props.bigDataRenderRange;
    const {left, plain} = parent.tableWidth;
    const {
        // 容器
        containerStyle,
        handleContainerScroll,
        // 轨道
        trackHeight,
        //  内容
        contentRef,
        contentStyle,
        data,
        step,
        // 状态及数据
        shouldRenderDirectly,
    } = useBigDataRender({
        data: rows,
        height,
        range
    });
    console.log(step)

    const extendStyle = Object.assign({}, containerStyle, {
        height,
        paddingLeft: `${left}px`
    });

    return <div
        onScroll={e => {
            parent.syncScroll(e);
            handleContainerScroll(e);
        }}
        style={extendStyle}
        className={'u-body__track'}
        ref={forwardRef}
    >
        <div className={'u-table-body'} style={shouldRenderDirectly ? null : {height: trackHeight}}>
            <div
                ref={contentRef}
                style={contentStyle}
            >
                {renderTable(colGroup, null, renderTBody.call(parent, columns, data, step * range, 'normal'), {width: plain})}
            </div>
        </div>
        {
            // 在有些浏览器中，padding-bottom 和 padding-right的布局标准有些怪异，
            // 导致不会计入 scrollWidth | scrollHeight,
            // 所以需要使用空div占位符代替以统一布局
        }
        {rightPlaceholder.call(parent)}
    </div>;
};


/**
 * 渲染分体式的表格
 * */
const renderSplitLayoutTable = function (columns, rows) {
    const {props, state} = this;
    const {left, plain} = this.tableWidth;
    const colGroup = renderColumns.call(this, columns);

    const obj = {
        parent: this,
        rows,
        columns,
        colGroup,
        height: props.tableHeight,
        forwardRef: this.plainTableBodyTrackEl
    };
    return (
        <div className='u-plain__table u-main__table'>
            <div className={'u-header__track' + (state.topShadow ? '  _shadow ' : '')}
                 style={{paddingLeft: `${left}px`, overflowY: this.scrollBarY ? 'scroll' : 'hidden'}}
                 ref={this.plainTableHeadTrackEl}
            >
                <div className="u-table-header">
                    {renderTable(colGroup, renderTHead.call(this, columns), null, {width: plain})}
                </div>
                {/* 右侧固定列占位符 */}
                {rightPlaceholder.call(this)}
            </div>
            <SplitLayoutTableBody {...obj}/>
        </div>
    );
};


/**
 * 渲染底部表格
 * */
const renderBottomTable = function (columns, leftTableWidth, plainTableWidth, rightTableWidth) {
    const {state, props} = this;
    return (
        <div className='u-fixed-bottom__table' style={{bottom: this.scrollBarX, right: this.scrollBarY}}>
            <div className='u-plain__table'
                 style={{paddingLeft: leftTableWidth}}
                 ref={this.handleBottomMount}
            >
                <div className="u-table-body" style={{width: plainTableWidth}}>
                    {renderTable(renderColumns.call(this, columns.plain), null, renderTBody.call(this, columns.plain, props.fixedRows, 'bottom'))}
                </div>
                {rightPlaceholder.call(this)}
            </div>

            {
                this.HAS_LEFT && (
                    <div className={'u-fixed-left__table ' + (state.leftShadow ? '_shadow ' : '')}
                         style={{width: leftTableWidth}}>
                        <div className="u-table-body">
                            {renderTable(renderColumns.call(this, columns.left), null, renderTBody.call(this, columns.left, props.fixedRows, 'bottom'))}
                        </div>
                    </div>
                )
            }
            {
                this.HAS_RIGHT && (
                    <div className={'u-fixed-right__table ' + (state.rightShadow ? '_shadow ' : '')}
                         style={{width: rightTableWidth}}
                    >
                        <div className="u-table-body">
                            {renderTable(renderColumns.call(this, columns.right), null, renderTBody.call(this, columns.right, props.fixedRows, 'bottom'))}
                        </div>
                    </div>
                )
            }
        </div>
    );

};

const noWork = () => null;

Table.defaultProps = {
    columns: [],
    type: 'stretch',
    align: 'center',
    fixedRows: [],
    rows: [],
    rowKey: 'key',
    databaseSort: false,  // 是否使用数据库排序, 默认是表格自动排序
    dragAble: false,  // 允许用户拖拽设置表格列宽
    useSplitLayout: false, // 使用分体布局
    onSortChange: noWork,
    onSelectRowChange: noWork,
    onRow: noWork,
    clearStateWhenRowsChange: false,
    bigDataRenderRange: 30, // 大数据渲染 一屏的数据范围
};

Table.propTypes = {
    columns: PropTypes.array,     // 列配置
    tableHeight: PropTypes.number,    // 表格体高度
    type: PropTypes.oneOf(['tile', 'stretch']), // 平铺 拉伸布局

    useSplitLayout: PropTypes.bool, // 使用分体布局
    zebra: PropTypes.bool,        // 是否需要斑马线
    loading: PropTypes.bool,      // 控制表格显示loading
    dragAble: PropTypes.bool, // 禁用设置表格列宽
    databaseSort: PropTypes.bool, // 排序方式，表格自身排序 | 数据库排序（有onSortChange事件）

    onSortChange: PropTypes.func, // 选择数据库排序，排序变化时触发
    onSelectRowChange: PropTypes.func, // 表格行选中改变

    emptyTip: PropTypes.node,     // 定义表格为空数据时要显示的提示
    align: PropTypes.oneOf(['left', 'right', 'center']), // 表格内文本对齐
    rows: PropTypes.array,
    fixedRows: PropTypes.array,
    rowKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), // 表格行 key 的取值，可以是字符串或数值

    bigDataRenderRange: PropTypes.number, // 大数据渲染 一屏的数据范围
    clearStateWhenRowsChange: PropTypes.bool
};

export default Table;